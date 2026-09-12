/**
 * OpenAI 兼容接口的大模型调用封装。
 * 通过环境变量配置（.env.local）：
 *   LLM_API_KEY  必填，API Key
 *   LLM_BASE_URL 可选，默认 https://api.deepseek.com/v1（DeepSeek）
 *   LLM_MODEL    可选，默认 deepseek-chat
 * 也兼容 OpenAI（https://api.openai.com/v1 + gpt-4o-mini）、
 * 豆包火山（https://ark.cn-beijing.volces.com/api/v3）、
 * 通义（https://dashscope.aliyuncs.com/compatible-mode/v1）等 OpenAI 兼容端点。
 */

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 读取 LLM 配置；未配置 LLM_API_KEY 时返回 null */
export function getLlmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    model: process.env.LLM_MODEL || 'deepseek-chat',
  };
}

/** 流式调用 Chat Completions，逐段产出增量文本 */
export async function* streamChat(
  messages: LlmMessage[],
  config: LlmConfig,
): AsyncGenerator<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`大模型请求失败（HTTP ${res.status}）：${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          yield delta;
        }
      } catch {
        // 忽略无法解析的 SSE 片段
      }
    }
  }
}

/** 非流式调用，用于低温度、结构化的项目记忆整理。 */
export async function completeChat(
  messages: LlmMessage[],
  config: LlmConfig,
  temperature = 0.1,
): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages, stream: false, temperature }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`记忆整理请求失败（HTTP ${res.status}）：${detail.slice(0, 200)}`);
  }
  const result = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return result.choices?.[0]?.message?.content || '';
}
