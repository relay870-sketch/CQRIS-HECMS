export interface MatchableBomItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  system?: string | null;
}

export interface BomMatch<T extends MatchableBomItem> {
  item: T;
  score: number;
  reasons: string[];
}

const CONSTRUCTION_SYNONYMS: Array<[RegExp, string]> = [
  [/摄像机(?:立杆|杆件|杆体|杆)/g, '摄像机立柱'],
  [/监控(?:立杆|杆件|杆体|杆)/g, '摄像机立柱'],
  [/(?:立杆|杆件|杆体)/g, '立柱'],
];

export function normalizeMatchText(value: string): string {
  let normalized = value.toLowerCase().replace(/[\s（）()【】\[\]、，,。.·_\-/]/g, '');
  for (const [pattern, canonical] of CONSTRUCTION_SYNONYMS) normalized = normalized.replace(pattern, canonical);
  return normalized;
}

function bigrams(value: string): Set<string> {
  const result = new Set<string>();
  if (value.length < 2) { if (value) result.add(value); return result; }
  for (let index = 0; index < value.length - 1; index++) result.add(value.slice(index, index + 2));
  return result;
}

function similarity(left: string, right: string): number {
  const a = bigrams(left); const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const value of a) if (b.has(value)) common++;
  return common / (a.size + b.size - common);
}

export function rankBomMatches<T extends MatchableBomItem>(
  query: string,
  items: T[],
  options: { system?: string; unit?: string; history?: Record<string, number> } = {},
): Array<BomMatch<T>> {
  const normalizedQuery = normalizeMatchText(query);
  if (!normalizedQuery) return [];
  return items.map((item) => {
    const name = normalizeMatchText(item.name); const code = normalizeMatchText(item.code);
    let score = 0; const reasons: string[] = [];
    if (name === normalizedQuery) { score += 82; reasons.push('名称完全一致'); }
    else if (name.includes(normalizedQuery) || normalizedQuery.includes(name)) { score += 62; reasons.push('名称高度相关'); }
    else {
      const semantic = similarity(normalizedQuery, name);
      score += Math.round(semantic * 55);
      if (semantic >= 0.25) reasons.push('施工关键词相似');
    }
    if (code && (code.includes(normalizedQuery) || normalizedQuery.includes(code))) { score += 70; reasons.push('清单编号匹配'); }
    if (options.system && item.system === options.system) { score += 10; reasons.push('所属系统一致'); }
    if (options.unit && item.unit === options.unit) { score += 6; reasons.push('计量单位一致'); }
    const historyCount = options.history?.[item.id] || 0;
    if (historyCount > 0) { score += Math.min(18, 6 + historyCount * 2); reasons.push(`历史确认${historyCount}次`); }
    return { item, score: Math.min(99, score), reasons };
  }).filter((match) => match.score >= 18).sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code)).slice(0, 3);
}
