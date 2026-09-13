import { randomUUID } from 'crypto';
import { getDb, initDbWithSeed } from '@/lib/db';

initDbWithSeed();

/**
 * 本地智能体工具：
 * - searchKnowledge：关键词检索知识库文档（documents 表）
 * - getRecentReports：按项目汇总最近 N 天的施工报工记录
 */

interface DocumentRow {
  id: string;
  name: string;
  category: string;
  type: string;
  content: string | null;
  upload_date: string;
}

interface ReportRow {
  id: string;
  date: string;
  location: string | null;
  lane: string | null;
  device_point: string | null;
  work_type: string;
  quantity: number;
  unit: string | null;
  workers: string | null;
  weather: string | null;
  issue: string | null;
  notes: string | null;
  submitter: string | null;
  work_items: string | null;
}

interface WorkItemRow {
  name: string;
  unit: string;
  quantity: number;
  location: string;
}

const STOP_KEYWORDS = new Set([
  '什么', '怎么', '如何', '怎样', '哪些', '哪个', '多少', '是否', '可以', '请问',
  '一下', '一个', '这个', '那个', '我们', '你们', '他们', '还是', '或者', '以及',
  '然后', '但是', '因为', '所以', '如果', '就是', '不是', '没有', '需要', '应该',
  '麻烦', '帮忙', '帮我', '给我', '咱们', '大家', '请问一下', '来着', '的话',
]);

/** 从查询中提取 2~4 字的关键词（中文 n-gram + 英文/数字片段） */
export function extractKeywords(query: string): string[] {
  const segments = query
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const keywords = new Set<string>();

  for (const seg of segments) {
    // 纯英文/数字：整个片段作为关键词（长度 >= 3 时）
    if (/^[A-Za-z0-9]+$/.test(seg)) {
      if (seg.length >= 2) keywords.add(seg.toLowerCase());
      continue;
    }
    // 中文：取 2~4 字连续子串
    if (seg.length <= 4) keywords.add(seg);
    for (let len = 2; len <= Math.min(4, seg.length); len++) {
      for (let i = 0; i + len <= seg.length; i++) {
        const kw = seg.slice(i, i + len);
        if (!STOP_KEYWORDS.has(kw)) keywords.add(kw);
      }
    }
  }

  return [...keywords].slice(0, 30);
}

/** 从内容中提取包含关键词的上下文片段（供 LLM 阅读；不区分大小写，覆盖更多条目） */
function extractSnippets(
  content: string,
  keywords: string[],
  maxSnippets: number,
  snippetLen: number,
): string {
  const used: number[] = [];
  const snippets: string[] = [];
  const lowerContent = content.toLowerCase();

  for (const kw of keywords) {
    if (snippets.length >= maxSnippets) break;
    const lowerKw = kw.toLowerCase();
    let idx = lowerContent.indexOf(lowerKw);
    let guard = 0;
    while (idx >= 0 && guard < 20) {
      guard++;
      const overlapped = used.some((s) => idx >= s - snippetLen && idx <= s + snippetLen);
      if (!overlapped) {
        const start = Math.max(0, idx - 150);
        const end = Math.min(content.length, idx + lowerKw.length + snippetLen);
        snippets.push(content.slice(start, end));
        used.push(idx);
        break;
      }
      idx = lowerContent.indexOf(lowerKw, idx + 1);
    }
  }

  if (snippets.length === 0) return content.slice(0, snippetLen);
  return snippets.map((s) => `…${s}…`).join('\n');
}

/** 检索指定项目的知识库，返回包含关键词上下文的参考资料文本（无结果返回空字符串） */
export function searchKnowledge(query: string, projectId: string, limit = 4): string {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return '';

  const db = getDb();
  const hits = new Map<string, { row: DocumentRow; count: number }>();

  for (const kw of keywords) {
    const like = `%${kw}%`;
    const rows = db.prepare(`
      SELECT id, name, category, type, content, upload_date
      FROM documents
      WHERE project_id = ? AND (name LIKE ? OR category LIKE ? OR content LIKE ?)
    `).all(projectId, like, like, like) as DocumentRow[];

    for (const row of rows) {
      const existing = hits.get(row.id);
      if (existing) {
        existing.count += 1;
      } else {
        hits.set(row.id, { row, count: 1 });
      }
    }
  }

  const ranked = [...hits.values()]
    .filter((h) => h.row.content && h.row.content.trim().length > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  if (ranked.length === 0) return '';

  return ranked
    .map((h, idx) => {
      const name = h.row.name || '未命名文档';
      const content = (h.row.content || '').trim();
      const snippets = extractSnippets(content, keywords, 3, 600);
      return `[资料${idx + 1}]《${name}》（分类：${h.row.category || '其他'}）\n${snippets}`;
    })
    .join('\n\n');
}

/** 查询项目名称 */
export function getProjectName(projectId: string): string {
  const db = getDb();
  const row = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as
    | { name: string }
    | undefined;
  return row?.name || projectId;
}

const MAX_CHAT_MEMORY_PER_PROJECT = 200;
export type ProjectMemoryCategory = 'facts' | 'preferences' | 'open_issues' | 'decisions';
export type ProjectMemorySnapshot = Record<ProjectMemoryCategory, string[]>;

const MEMORY_LABELS: Record<ProjectMemoryCategory, string> = {
  facts: '重要事实', preferences: '施工偏好', open_issues: '遗留问题', decisions: '关键结论',
};

/** 保存一条 AI 问答消息（按项目永久存储） */
export function saveChatMessage(projectId: string, role: 'user' | 'assistant', content: string): void {
  if (!projectId || !content.trim()) return;
  const db = getDb();
  db.prepare('INSERT INTO chat_messages (id, project_id, role, content) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), projectId, role, content.trim().slice(0, 8000));

  // 每项目保留最近 200 条，防止无限膨胀
  const count = db.prepare('SELECT COUNT(*) c FROM chat_messages WHERE project_id = ?').get(projectId) as { c: number };
  if (count.c > MAX_CHAT_MEMORY_PER_PROJECT) {
    db.prepare(`
      DELETE FROM chat_messages
      WHERE id IN (
        SELECT id FROM chat_messages WHERE project_id = ?
        ORDER BY rowid ASC LIMIT ?
      )
    `).run(projectId, count.c - MAX_CHAT_MEMORY_PER_PROJECT);
  }
}

/** 读取某项目的问答历史（按时间正序） */
export function getChatHistory(
  projectId: string,
  limit = 50,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!projectId) return [];
  const db = getDb();
  return db.prepare(`
    SELECT role, content FROM (
      SELECT rowid, role, content FROM chat_messages
      WHERE project_id = ?
      ORDER BY rowid DESC
      LIMIT ?
    ) ORDER BY rowid ASC
  `).all(projectId, limit) as Array<{ role: 'user' | 'assistant'; content: string }>;
}

/** 获取项目长期记忆快照。 */
export function getProjectMemory(projectId: string): ProjectMemorySnapshot {
  const empty: ProjectMemorySnapshot = { facts: [], preferences: [], open_issues: [], decisions: [] };
  if (!projectId) return empty;
  const rows = getDb().prepare('SELECT category, content FROM project_memories WHERE project_id = ?').all(projectId) as Array<{ category: ProjectMemoryCategory; content: string }>;
  for (const row of rows) {
    try {
      const parsed: unknown = JSON.parse(row.content);
      if (Array.isArray(parsed)) empty[row.category] = parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    } catch {
      empty[row.category] = row.content.split('\n').map((item) => item.trim()).filter(Boolean);
    }
  }
  return empty;
}

/** 格式化为模型上下文；没有记忆时返回空字符串。 */
export function getProjectMemoryText(projectId: string): string {
  const memory = getProjectMemory(projectId);
  return (Object.keys(MEMORY_LABELS) as ProjectMemoryCategory[])
    .filter((category) => memory[category].length > 0)
    .map((category) => `【${MEMORY_LABELS[category]}】\n${memory[category].map((item) => `- ${item}`).join('\n')}`)
    .join('\n');
}

/** 用模型返回的完整快照替换四类项目记忆。 */
export function replaceProjectMemory(projectId: string, memory: ProjectMemorySnapshot): void {
  if (!projectId) return;
  const db = getDb();
  const upsert = db.prepare(`INSERT INTO project_memories (id, project_id, category, content, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(project_id, category) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`);
  db.transaction(() => {
    for (const category of Object.keys(MEMORY_LABELS) as ProjectMemoryCategory[]) {
      const items = memory[category].map((item) => item.trim()).filter(Boolean).slice(0, 12);
      upsert.run(randomUUID(), projectId, category, JSON.stringify(items));
    }
  })();
}

/** 清空某项目的全部长期记忆，不影响 AI 对话历史。 */
export function clearProjectMemory(projectId: string): void {
  if (!projectId) return;
  getDb().prepare('DELETE FROM project_memories WHERE project_id = ?').run(projectId);
}

/** 清空某项目的问答记忆 */
export function clearChatHistory(projectId: string): void {
  if (!projectId) return;
  const db = getDb();
  db.prepare('DELETE FROM chat_messages WHERE project_id = ?').run(projectId);
}

/** 按项目汇总最近 N 天的施工报工记录，返回格式化文本（无记录返回空字符串） */
export function getRecentReports(projectId: string, days = 7): string {
  const db = getDb();
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().split('T')[0];

  const rows = db.prepare(`
    SELECT id, date, location, lane, device_point, work_type, quantity, unit,
           workers, weather, issue, notes, submitter, work_items
    FROM reports
    WHERE project_id = ? AND date >= ?
    ORDER BY date DESC, created_at DESC
  `).all(projectId, since) as ReportRow[];

  if (rows.length === 0) return '';

  // 缓存人员 id -> 姓名
  const workerNames = new Map<string, string>();

  const formatWorkers = (json: string | null): string => {
    if (!json) return '';
    try {
      const ids = JSON.parse(json) as string[];
      return ids
        .map((id) => {
          if (workerNames.has(id)) return workerNames.get(id) || id;
          const w = db.prepare('SELECT name FROM workers WHERE id = ?').get(id) as
            | { name: string }
            | undefined;
          const name = w?.name || id;
          workerNames.set(id, name);
          return name;
        })
        .join('、');
    } catch {
      return '';
    }
  };

  const lines: string[] = [];
  const typeCount = new Map<string, number>();
  const issues: string[] = [];

  const parseWorkItems = (json: string | null): WorkItemRow[] => {
    if (!json) return [];
    try {
      const arr = JSON.parse(json) as WorkItemRow[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  for (const r of rows) {
    const items = parseWorkItems(r.work_items);
    const workTypes = items.length > 0
      ? items
      : [{ name: r.work_type, unit: r.unit || '', quantity: r.quantity, location: r.location || '' }];

    for (const it of workTypes) {
      typeCount.set(it.name, (typeCount.get(it.name) || 0) + 1);
    }
    if (r.issue && r.issue.trim()) {
      issues.push(`${r.date} ${r.location || ''}: ${r.issue}`);
    }

    const parts: string[] = [];
    if (r.device_point) parts.push(`点位${r.device_point}`);
    const contentText = workTypes
      .map((it) => `${it.location ? `${it.location} ` : ''}${it.name} ${it.quantity}${it.unit}`)
      .join('；');
    parts.push(`工作内容：${contentText}`);
    const workers = formatWorkers(r.workers);
    if (workers) parts.push(`人员${workers}`);
    if (r.weather) parts.push(`天气${r.weather}`);
    if (r.notes && r.notes.trim()) parts.push(`备注${r.notes}`);

    lines.push(`- ${r.date} ${parts.join(' | ')}`);
  }

  const statParts = [
    `共 ${rows.length} 条报工记录`,
    `工作类型分布：${[...typeCount.entries()].map(([t, c]) => `${t} ${c} 次`).join('，')}`,
  ];
  if (issues.length > 0) {
    statParts.push(`问题/异常 ${issues.length} 条`);
  }

  return [
    `最近 ${days} 天（${since} 至今）报工明细：`,
    ...lines,
    `统计：${statParts.join('；')}。`,
    ...(issues.length > 0 ? [`问题记录：\n${issues.join('\n')}`] : []),
  ].join('\n');
}
