import { NextRequest } from 'next/server';
import { LLMClient, KnowledgeClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { isCozeApiConfigured } from '@/lib/storage';
import { completeChat, getLlmConfig, streamChat, type LlmConfig, type LlmMessage } from '@/lib/llm';
import { buildProjectDataContext } from '@/lib/ai-project-context';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import {
  searchKnowledge,
  getProjectName,
  saveChatMessage,
  getChatHistory,
  getProjectMemory,
  getProjectMemoryText,
  replaceProjectMemory,
  type ProjectMemorySnapshot,
} from '@/lib/knowledge-tools';

export const runtime = 'nodejs';

const config = new Config();

function sseResponse(messages: Array<{ content: string }>): Response {
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    start(controller) {
      try {
        for (const msg of messages) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: msg.content })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        const errorMsg = `data: ${JSON.stringify({ error: '生成失败' })}\n\n`;
        controller.enqueue(encoder.encode(errorMsg));
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

function parseMemorySnapshot(content: string): ProjectMemorySnapshot | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
    const list = (key: string): string[] => Array.isArray(raw[key])
      ? raw[key].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()).slice(0, 12)
      : [];
    return { facts: list('facts'), preferences: list('preferences'), open_issues: list('openIssues'), decisions: list('decisions') };
  } catch {
    return null;
  }
}

async function refreshProjectMemory(projectId: string, userMessage: string, assistantMessage: string, llm: LlmConfig): Promise<void> {
  if (!projectId || !assistantMessage.trim()) return;
  const current = getProjectMemory(projectId);
  const result = await completeChat([
    {
      role: 'system',
      content: `你是项目长期记忆整理器。根据已有记忆和本轮对话，返回更新后的完整记忆快照，只输出 JSON，不要解释。
JSON 格式：{"facts":[],"preferences":[],"openIssues":[],"decisions":[]}。
规则：
1. 只保存对未来问答长期有用、且对话中明确出现的信息，不猜测、不编造。
2. facts=项目重要事实；preferences=明确的施工/管理/输出偏好；openIssues=尚未解决的问题；decisions=已经确认的决定或结论。
3. 已解决的问题应从 openIssues 移除；新信息与旧信息冲突时以本轮明确确认的信息为准。
4. 每类最多12条，每条简洁、独立、带必要日期或对象。
5. 禁止保存密码、API Key、登录凭据、手机号及其他敏感信息。`,
    },
    {
      role: 'user',
      content: `已有记忆：\n${JSON.stringify(current)}\n\n本轮用户：${userMessage.slice(0, 4000)}\n\n本轮助手：${assistantMessage.slice(0, 6000)}`,
    },
  ], llm, 0.1);
  const snapshot = parseMemorySnapshot(result);
  if (snapshot) replaceProjectMemory(projectId, snapshot);
}

// POST /api/knowledge/chat - AI Q&A with streaming
export async function POST(request: NextRequest) {
  try {
    const { message, history = [], projectId, projectName } = await request.json();

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: '请输入问题' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const pid = typeof projectId === 'string' ? projectId : '';
    if (pid && !getDb().prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) {
      return new Response(JSON.stringify({ error: '当前项目不存在或已被删除' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    const projectMemoryText = pid ? getProjectMemoryText(pid) : '';
    const projectDataText = pid ? buildProjectDataContext(message.trim(), pid) : '';
    if (projectDataText) {
      void writeAuditLog(getDb(), request, { projectId: pid, module: 'system', action: 'ai_query', entityType: '项目数据', summary: 'AI 只读查询项目、清单、考勤或施工记录数据' });
    }
    // 先保存用户消息（按项目永久记忆）
    saveChatMessage(pid, 'user', message);

    // ---------- 云端模式：Coze 环境（工作负载身份）走平台知识库 + LLM ----------
    if (isCozeApiConfigured()) {
      const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

      // Step 1: Search knowledge base for relevant context
      const knowledgeClient = new KnowledgeClient(config, customHeaders);
      let contextText = '';

      try {
        const searchResponse = await knowledgeClient.search(
          message.trim(),
          undefined,
          5,
          0.2
        );

        if (searchResponse.code === 0 && searchResponse.chunks && searchResponse.chunks.length > 0) {
          contextText = searchResponse.chunks
            .map((chunk, idx) => `[参考资料${idx + 1}]\n${chunk.content}`)
            .join('\n\n');
        }
      } catch {
        // Continue without context if search fails
      }

      // Step 2: Build messages with context
      const systemPrompt = `你是重庆瑞思施工管理系统的团队智能助手。你的职责是查询当前项目真实数据、帮助团队成员查询项目资料、解答施工技术问题。

请遵循以下规则：
1. 项目统计和事实必须基于“项目实时数据”，技术问题优先基于“参考资料”；没有数据时如实告知，禁止编造
2. 回答要简洁、专业、实用，适合施工现场人员阅读
3. 涉及安全规范的问题要特别强调安全注意事项
4. 每个项目统计结论必须注明时间范围，并引用[项目数据1-4]；引用文档时注明[参考资料编号]
5. “人·小时”表示人数乘以每人加班小时，不得误写成普通小时
6. 系统进度与按合同金额计算进度不一致时，分别说明口径
7. 如果问题不清晰，请主动询问以获取更多信息

${projectMemoryText ? `【项目长期记忆】\n${projectMemoryText}\n` : ''}
${projectDataText ? `【项目实时数据】\n${projectDataText}\n` : ''}
${contextText ? `【知识库参考资料】\n${contextText}` : '当前没有匹配的知识库资料。'}`;

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...history.slice(-6).map((msg: { role: string; content: string }) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user' as const, content: message.trim() },
      ];

      // Step 3: Stream response from LLM
      const llmClient = new LLMClient(config, customHeaders);
      const stream = llmClient.stream(messages, {
        model: 'doubao-seed-2-0-mini-260215',
        temperature: 0.7,
      });

      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          let assistantContent = '';
          try {
            for await (const chunk of stream) {
              if (chunk.content) {
                const text = chunk.content.toString();
                assistantContent += text;
                const data = `data: ${JSON.stringify({ content: text })}\n\n`;
                controller.enqueue(encoder.encode(data));
              }
            }
            saveChatMessage(pid, 'assistant', assistantContent);
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            const errorMsg = `data: ${JSON.stringify({ error: '生成失败' })}\n\n`;
            controller.enqueue(encoder.encode(errorMsg));
            controller.close();
          }
        },
      });

      return new Response(readableStream, { headers: SSE_HEADERS });
    }

    // ---------- 本地智能体模式：检索知识库 + 查日报 + OpenAI 兼容 LLM ----------
    const llm = getLlmConfig();
    if (!llm) {
      return sseResponse([{
        content: '尚未配置大模型 API Key，暂时无法进行 AI 问答。\n\n配置方法：在项目根目录的 `.env.local` 文件中添加：\n\nLLM_API_KEY=你的API密钥\nLLM_BASE_URL=https://api.deepseek.com/v1  （可选，默认 DeepSeek）\nLLM_MODEL=deepseek-chat  （可选）\n\nDeepSeek / 豆包 / 通义 / 硅基流动等 OpenAI 兼容服务都可以。配置完成后重启服务即可使用。\n\n在此之前，您可以使用「智能搜索」查找文档内容。',
      }]);
    }

    const pname =
      (pid ? getProjectName(pid) : '') ||
      (typeof projectName === 'string' && projectName) ||
      '当前项目';

    // Step 1: 按项目自动检索本地知识库
    const knowledgeText = searchKnowledge(message, pid, 4);

    // Step 2: 构建 system prompt（带知识资料、长期记忆和按需查询的项目实时数据）
    const systemPrompt = `你是重庆瑞思施工管理系统（${pname}）的团队智能助手。你的职责：解答施工技术问题、查询项目资料、整理施工日报和记录。

请遵循以下规则：
1. 项目统计和事实必须使用“项目实时数据”，技术问题优先使用“知识库参考资料”；没有数据时如实告知，不要编造
2. 回答要简洁、专业、实用，适合施工现场人员阅读
3. 涉及安全规范的问题要特别强调安全注意事项
4. 引用资料时注明文档名称或资料编号
5. 每个项目统计结论注明时间范围，并引用[项目数据1-4]；引用资料时注明[资料编号]
6. 整理日报时按日期和施工位置列出内容，统计出勤、加班人·小时、合同外施工与现场说明
7. “人·小时”是人数乘以每人加班小时；系统进度与合同金额进度口径不同时分别说明
8. 只能读取和分析数据，不能声称已经修改、删除或新增系统记录
9. 如果问题与提供的资料无关（如闲聊），可以正常回答

${projectMemoryText ? `【项目长期记忆】\n${projectMemoryText}\n` : ''}
${knowledgeText ? `【知识库参考资料】\n${knowledgeText}` : ''}
${projectDataText ? `\n【项目实时数据】\n${projectDataText}` : ''}`;

    // 对话历史：优先从该项目的永久记忆中取最近几条（前端传入的仅兜底）
    const storedHistory = pid ? getChatHistory(pid, 30).slice(-6) : [];
    const historyMessages = storedHistory.length > 0
      ? storedHistory
          .filter((h) => h.content !== message.trim()) // 去掉刚保存的当前问题
          .map((h) => ({ role: h.role, content: h.content }))
      : history.slice(-6).map((msg: { role: string; content: string }) => ({
          role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: msg.content,
        }));

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message.trim() },
    ];

    // Step 4: 流式输出
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let assistantContent = '';
        try {
          for await (const delta of streamChat(messages, llm)) {
            assistantContent += delta;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`));
          }
            saveChatMessage(pid, 'assistant', assistantContent);
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            try {
              await refreshProjectMemory(pid, message.trim(), assistantContent, llm);
            } catch (memoryError) {
              console.error('Project memory refresh error:', memoryError);
            }
        } catch (error) {
          console.error('Chat stream error:', error);
          const msg = error instanceof Error ? error.message : '未知错误';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: `生成失败：${msg}` })}\n\n`),
          );
          controller.close();
        }
      },
    });

    return new Response(readableStream, { headers: SSE_HEADERS });
  } catch (error) {
    console.error('Chat error:', error);
    return new Response(
      JSON.stringify({
        error: '问答服务异常',
        detail: error instanceof Error ? error.message : '未知错误',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
