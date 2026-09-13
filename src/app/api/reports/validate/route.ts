import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';
import { completeChat, getLlmRuntimePlan, type LlmConfig } from '@/lib/llm';
import { readAiPreferences } from '@/lib/ai-settings';
import { recordAiUsage } from '@/lib/ai-usage';

initDbWithSeed();

type Level = 'error' | 'warning' | 'passed';
interface CheckItem { level: Level; field: string; message: string; itemIndex?: number }
interface DraftItem { name: string; unit: string; quantity: number; location: string; workers: string[]; external: boolean; bomItemId: string | null }
interface AiReviewItem { index: number; clarity: 'clear' | 'improve'; suggestedLocation: string; suggestedDescription: string; risks: string[] }

function parseAiReview(content: string, itemCount: number): AiReviewItem[] {
  const start = content.indexOf('{'); const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const value = JSON.parse(content.slice(start, end + 1)) as { items?: unknown };
    if (!Array.isArray(value.items)) return [];
    return value.items.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return [];
      const item = raw as Record<string, unknown>; const index = Number(item.index);
      if (!Number.isInteger(index) || index < 0 || index >= itemCount) return [];
      return [{ index, clarity: item.clarity === 'improve' ? 'improve' as const : 'clear' as const,
        suggestedLocation: typeof item.suggestedLocation === 'string' ? item.suggestedLocation.trim().slice(0, 200) : '',
        suggestedDescription: typeof item.suggestedDescription === 'string' ? item.suggestedDescription.trim().slice(0, 300) : '',
        risks: Array.isArray(item.risks) ? item.risks.filter((risk): risk is string => typeof risk === 'string').map((risk) => risk.trim().slice(0, 200)).filter(Boolean).slice(0, 3) : [] }];
    });
  } catch { return []; }
}

async function reviewWithAi(projectId: string, system: string, date: string, items: DraftItem[], llm: LlmConfig): Promise<AiReviewItem[]> {
  const result = await completeChat([{ role: 'system', content: `你是高速公路机电工程报工审核助手。仅审查文字清晰度、可能遗漏和一般提示建议，不计算工程量，不判断合同数据，不虚构规范要求。返回JSON且不要解释：{"items":[{"index":0,"clarity":"clear或improve","suggestedLocation":"仅不清楚时给改写建议，否则空字符串","suggestedDescription":"仅不清楚时给更具体但不添加未知事实的改写模板，否则空字符串","risks":["最多3条简短提示或建议，没有则空数组"]}]}。
施工位置可以是桩号，也可以是“驻地”“XX收费站”“分中心”“隧道机房”等明确的中文地点。这类中文位置应视为清楚，不得强制建议改为桩号。
施工位置、数量和计量单位都有独立字段，因此 suggestedDescription 只能包含“施工对象＋具体工序＋已明确的完成状态”，严禁重复位置、桩号、数量、数字工程量或计量单位。用户没有明确填写完成状态时不得自行添加；不得把推测当事实；未知信息用“___”占位。` },
    { role: 'user', content: JSON.stringify({ projectId, date, system, items: items.map((item, index) => ({ index, location: item.location, description: item.name, external: item.external })) }) }], llm, 0.1, 12000);
  return parseAiReview(result, items.length);
}

function parseItems(value: unknown): DraftItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    return [{
      name: typeof item.name === 'string' ? item.name.trim() : '',
      unit: typeof item.unit === 'string' ? item.unit.trim() : '',
      quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity),
      location: typeof item.location === 'string' ? item.location.trim() : '',
      workers: Array.isArray(item.workers) ? item.workers.filter((id): id is string => typeof id === 'string') : [],
      external: item.external === true,
      bomItemId: typeof item.bomItemId === 'string' && item.bomItemId ? item.bomItemId : null,
    }];
  });
}

function oldQuantityByBom(workItems: string | null): Map<string, number> {
  const quantities = new Map<string, number>();
  try {
    const items = JSON.parse(workItems || '[]') as Array<{ bomItemId?: unknown; quantity?: unknown }>;
    if (Array.isArray(items)) for (const item of items) {
      if (typeof item.bomItemId === 'string' && typeof item.quantity === 'number') quantities.set(item.bomItemId, (quantities.get(item.bomItemId) || 0) + item.quantity);
    }
  } catch { /* 历史异常内容不参与编辑回退 */ }
  return quantities;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: '检查数据格式错误' }, { status: 400 }); }
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const date = typeof body.date === 'string' ? body.date : '';
  const system = typeof body.system === 'string' ? body.system.trim() : '';
  const editId = typeof body.editId === 'string' ? body.editId : '';
  const items = parseItems(body.workItems);
  const db = getDb();
  if (!projectId || !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) return NextResponse.json({ error: '当前项目不存在' }, { status: 404 });

  const checks: CheckItem[] = [];
  const add = (level: Level, field: string, message: string, itemIndex?: number) => checks.push({ level, field, message, ...(itemIndex === undefined ? {} : { itemIndex }) });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) add('error', '施工日期', '请填写有效的施工日期');
  else {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
    if (date > today) add('warning', '施工日期', `施工日期为未来日期 ${date}，请确认是否正确`);
    else add('passed', '施工日期', `已填写 ${date}`);
  }
  if (!system) add('error', '所属系统', '请选择所属系统');
  else add('passed', '所属系统', `已选择“${system}”`);
  if (!items.length) add('error', '施工内容', '请至少填写一项施工内容');

  const formalLocations = new Set((db.prepare('SELECT name FROM project_locations WHERE project_id = ?').all(projectId) as Array<{ name: string }>).map((row) => row.name));
  const existing = editId ? db.prepare('SELECT work_items FROM reports WHERE id = ? AND project_id = ?').get(editId, projectId) as { work_items: string | null } | undefined : undefined;
  const oldQuantities = oldQuantityByBom(existing?.work_items || null);
  const submittedByBom = new Map<string, number>();

  items.forEach((item, index) => {
    const number = index + 1;
    if (!item.location) add('error', '施工位置', `第${number}项未填写施工位置或桩号`, index);
    else if (!formalLocations.has(item.location) && !/[\u3400-\u9fff]/.test(item.location) && (/^[A-Za-z0-9]+$/.test(item.location) || item.location.length < 3)) add('warning', '施工位置', `第${number}项位置“${item.location}”较简略，请确认是否正确`, index);
    else add('passed', '施工位置', `第${number}项位置已填写`, index);

    if (!item.name) add('error', '施工内容', `第${number}项未填写施工内容`, index);
    else if (item.name.length < 4 || /^(施工|安装|调试|安装设备|现场施工|设备安装)$/.test(item.name)) add('warning', '施工内容', `第${number}项“${item.name}”描述较笼统，建议写明设备或具体工序`, index);
    else add('passed', '施工内容', `第${number}项内容已填写`, index);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) add('error', '工程量', `第${number}项工程量必须大于0`, index);
    if (!item.unit) add('error', '计量单位', `第${number}项未填写计量单位`, index);
    if (!item.workers.length) add('warning', '参与人员', `第${number}项未选择参与人员，将不会生成考勤`, index);

    const duplicateRows = db.prepare(`SELECT id, work_items FROM reports WHERE project_id = ? AND date = ? AND id <> ?`).all(projectId, date, editId) as Array<{ id: string; work_items: string | null }>;
    const duplicate = duplicateRows.some((row) => {
      try {
        const prior = JSON.parse(row.work_items || '[]') as Array<{ name?: unknown; location?: unknown }>;
        return Array.isArray(prior) && prior.some((value) => value.name === item.name && value.location === item.location);
      } catch { return false; }
    });
    if (duplicate) add('warning', '重复填报', `第${number}项在当天已有相同施工内容和位置，请确认不是重复报工`, index);

    if (!item.bomItemId) {
      if (!item.external) add('warning', '清单关联', `第${number}项未关联工程量清单；如属合同外施工，请勾选“合同外”`, index);
      return;
    }
    const bom = db.prepare('SELECT code, name, unit, total_qty, completed_qty, project_id FROM bom_items WHERE id = ?').get(item.bomItemId) as { code: string; name: string; unit: string; total_qty: number; completed_qty: number; project_id: string } | undefined;
    if (!bom || bom.project_id !== projectId) { add('error', '清单关联', `第${number}项关联的清单子目无效`, index); return; }
    if (bom.unit !== item.unit) add('error', '计量单位', `第${number}项单位为“${item.unit}”，清单 ${bom.code} 的标准单位为“${bom.unit}”`, index);
    const accumulated = (submittedByBom.get(item.bomItemId) || 0) + (Number.isFinite(item.quantity) ? item.quantity : 0);
    submittedByBom.set(item.bomItemId, accumulated);
    const effectiveCompleted = Math.max(0, bom.completed_qty - (oldQuantities.get(item.bomItemId) || 0));
    const remaining = Math.max(0, bom.total_qty - effectiveCompleted);
    if (accumulated > remaining) add('warning', '合同工程量', `第${number}项累计填报${accumulated}${bom.unit}，超过清单 ${bom.code} 剩余${remaining}${bom.unit}；请确认后继续提交`, index);
    else add('passed', '清单关联', `第${number}项已匹配 ${bom.code} ${bom.name}，剩余${remaining}${bom.unit}`, index);

  });

  const errors = checks.filter((item) => item.level === 'error').length;
  const warnings = checks.filter((item) => item.level === 'warning').length;
  let aiReview: { available: boolean; model?: string; items: AiReviewItem[]; notice?: string } = { available: false, items: [], notice: '未配置模型或异常检查能力已关闭' };
  const preferences = readAiPreferences(); const plan = preferences.abilities.reportReview ? getLlmRuntimePlan() : null;
  if (plan && items.length > 0) {
    let active = plan.primary; let fallbackUsed = false; const startedAt = Date.now();
    try {
      let reviewItems: AiReviewItem[];
      try { reviewItems = await reviewWithAi(projectId, system, date, items, active); }
      catch (primaryError) { if (!plan.fallback) throw primaryError; active = plan.fallback; fallbackUsed = true; reviewItems = await reviewWithAi(projectId, system, date, items, active); }
      aiReview = { available: true, model: active.profileName || active.model, items: reviewItems, notice: reviewItems.length ? undefined : 'AI未发现需要补充的文字问题' };
      recordAiUsage({ projectId, profileId: active.profileId, model: active.model, taskType: 'report_review', success: true, fallbackUsed, durationMs: Date.now() - startedAt });
    } catch (error) {
      aiReview = { available: false, items: [], notice: 'AI语义检查暂时不可用，硬性规则检查不受影响' };
      recordAiUsage({ projectId, profileId: active.profileId, model: active.model, taskType: 'report_review', success: false, fallbackUsed, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : '检查失败' });
    }
  }
  return NextResponse.json({
    success: true,
    canSubmit: errors === 0,
    checks,
    summary: { passed: checks.filter((item) => item.level === 'passed').length, warnings, errors },
    source: { projectId, date, checkedAt: new Date().toISOString(), rules: ['必填项', '位置与描述清晰度', '计量单位', '合同剩余量', '清单关联', '疑似重复填报'] },
    aiReview,
  });
}
