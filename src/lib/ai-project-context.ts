import { getDb } from '@/lib/db';
import { defaultAiAbilities, type AiAbilities } from '@/lib/ai-settings';

interface DateRange { start: string; end: string; label: string }
interface ReportRow { date: string; location: string; work_type: string; quantity: number; unit: string; workers: string; weather: string | null; issue: string | null; notes: string | null; work_items: string | null; system: string | null }
interface WorkItem { name?: unknown; quantity?: unknown; unit?: unknown; location?: unknown; external?: unknown; attendance?: unknown; overtimeHours?: unknown; workers?: unknown }

function dateString(date: Date): string { return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }); }
function addDays(value: Date, days: number): Date { const next = new Date(value); next.setDate(next.getDate() + days); return next; }
function startOfWeek(value: Date): Date { const day = value.getDay() || 7; return addDays(value, 1 - day); }
function monthRange(value: Date, label: string): DateRange { const start = new Date(value.getFullYear(), value.getMonth(), 1); const end = new Date(value.getFullYear(), value.getMonth() + 1, 0); return { start: dateString(start), end: dateString(end), label }; }

export function inferDateRange(question: string, now = new Date()): DateRange {
  const explicit = [...question.matchAll(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/g)].map((match) => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
  if (explicit.length >= 2) return { start: explicit[0], end: explicit[1], label: `${explicit[0]}至${explicit[1]}` };
  if (explicit.length === 1) return { start: explicit[0], end: explicit[0], label: explicit[0] };
  const today = dateString(now);
  if (/昨天|昨日/.test(question)) { const value = dateString(addDays(now, -1)); return { start: value, end: value, label: '昨天' }; }
  if (/今天|今日|当天/.test(question)) return { start: today, end: today, label: '今天' };
  if (/上周/.test(question)) { const end = addDays(startOfWeek(now), -1); const start = addDays(end, -6); return { start: dateString(start), end: dateString(end), label: '上周' }; }
  if (/本周|这周/.test(question)) return { start: dateString(startOfWeek(now)), end: today, label: '本周' };
  if (/上月|上个月/.test(question)) return monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1), '上月');
  if (/本月|这个月/.test(question)) { const range = monthRange(now, '本月'); return { ...range, end: today }; }
  const recent = question.match(/最近\s*(\d{1,3})\s*天/); const days = recent ? Math.min(90, Math.max(1, Number(recent[1]))) : 7;
  return { start: dateString(addDays(now, 1 - days)), end: today, label: `最近${days}天` };
}

function parseItems(row: ReportRow): WorkItem[] {
  try { const value: unknown = JSON.parse(row.work_items || '[]'); if (Array.isArray(value) && value.length > 0) return value.filter((item): item is WorkItem => !!item && typeof item === 'object'); } catch { /* 兼容旧记录 */ }
  return [{ name: row.work_type, quantity: row.quantity, unit: row.unit, location: row.location }];
}
function workerIds(value: unknown): string[] { return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; }
function parseWorkerJson(value: string): string[] { try { return workerIds(JSON.parse(value || '[]')); } catch { return []; } }
function mentionedName(question: string, values: string[]): string | null {
  return values.filter((value) => value && question.includes(value)).sort((a, b) => b.length - a.length)[0] || null;
}

export function buildProjectDataContext(question: string, projectId: string, abilities: AiAbilities = defaultAiAbilities): string {
  if (!projectId) return '';
  const db = getDb();
  const project = db.prepare('SELECT id, name, section, status, start_date, end_date, manager, progress FROM projects WHERE id = ?').get(projectId) as { id: string; name: string; section: string; status: string; start_date: string; end_date: string; manager: string; progress: number } | undefined;
  if (!project) return '';
  const broad = /日报|汇总|概况|情况|分析|统计|总结|风险|提醒/.test(question);
  const wantsProject = broad || /项目|负责人|工期|状态|总进度/.test(question);
  const wantsBom = (abilities.progressAnalysis || abilities.anomalyAnalysis) && (broad || /清单|进度|工程量|合同额|单价|子目|未开始|未完成|完成|剩余|超量|滞后/.test(question));
  const wantsAttendance = abilities.attendanceAnalysis && (broad || /考勤|出勤|人员|谁|加班|半天|未出勤/.test(question));
  const wantsReports = (abilities.dailyReport || abilities.anomalyAnalysis) && (broad || /施工|报工|记录|日报|今天|昨日|昨天|位置|桩号|天气|合同外|异常|现场说明|干了|完成了/.test(question));
  if (!wantsProject && !wantsBom && !wantsAttendance && !wantsReports) return '';
  const range = inferDateRange(question);
  const systemNames = (db.prepare('SELECT name FROM project_systems WHERE project_id = ?').all(projectId) as Array<{ name: string }>).map((row) => row.name);
  const workers = db.prepare('SELECT id, name FROM workers WHERE project_id = ?').all(projectId) as Array<{ id: string; name: string }>;
  const bomIdentities = db.prepare('SELECT code, name FROM bom_items WHERE project_id = ?').all(projectId) as Array<{ code: string; name: string }>;
  const selectedSystem = mentionedName(question, systemNames);
  const selectedWorkerName = mentionedName(question, workers.map((worker) => worker.name));
  const selectedWorker = workers.find((worker) => worker.name === selectedWorkerName) || null;
  const selectedBom = bomIdentities.filter((item) => question.includes(item.code) || question.includes(item.name)).sort((a, b) => b.name.length - a.name.length)[0] || null;
  const filterText = [selectedSystem ? `系统=${selectedSystem}` : '', selectedWorker ? `人员=${selectedWorker.name}` : '', selectedBom ? `清单子目=${selectedBom.code} ${selectedBom.name}` : ''].filter(Boolean).join('；') || '无额外筛选';
  const sections: string[] = [`【数据库查询计划】项目=${project.name}；时间=${range.label}（${range.start}至${range.end}）；${filterText}；查询生成时间=${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n【可核对的数据出处】项目档案：/project/${projectId}；工程量清单：/manage/bom?projectId=${projectId}${selectedSystem ? `&system=${encodeURIComponent(selectedSystem)}` : ''}；考勤记录：/manage/attendance?dateFrom=${range.start}&dateTo=${range.end}${selectedWorker ? `&workerId=${selectedWorker.id}` : ''}；施工记录：/records?dateFrom=${range.start}&dateTo=${range.end}${selectedSystem ? `&system=${encodeURIComponent(selectedSystem)}` : ''}${selectedWorker ? `&workerId=${selectedWorker.id}` : ''}`];

  if (wantsProject) {
    const status = project.status === 'in_progress' ? '进行中' : project.status === 'completed' ? '已完工' : '已暂停';
    sections.push(`[项目数据1｜项目档案] 名称：${project.name}；标段：${project.section}；状态：${status}；负责人：${project.manager || '未设置'}；计划工期：${project.start_date || '未设置'}至${project.end_date || '未设置'}；系统进度：${project.progress}%`);
  }

  if (wantsBom) {
    const bomParams: string[] = [projectId]; let bomFilter = '';
    if (selectedSystem) { bomFilter += ' AND system = ?'; bomParams.push(selectedSystem); }
    if (selectedBom) { bomFilter += ' AND code = ?'; bomParams.push(selectedBom.code); }
    const items = db.prepare(`SELECT code, name, unit, total_qty, completed_qty, unit_price, system FROM bom_items WHERE project_id = ?${bomFilter} ORDER BY system, code`).all(...bomParams) as Array<{ code: string; name: string; unit: string; total_qty: number; completed_qty: number; unit_price: number; system: string | null }>;
    const priced = items.filter((item) => item.unit_price > 0);
    const contract = priced.reduce((sum, item) => sum + item.total_qty * item.unit_price, 0);
    const earned = priced.reduce((sum, item) => sum + Math.min(item.total_qty, item.completed_qty) * item.unit_price, 0);
    const progress = contract > 0 ? earned / contract * 100 : project.progress;
    const progressLabel = contract > 0 ? `按已定价合同金额计算进度${progress.toFixed(1)}%` : `暂无已定价合同金额，暂用系统人工进度${project.progress}%`;
    const systems = new Map<string, { total: number; done: number }>();
    for (const item of priced) { const key = item.system || '未指定'; const current = systems.get(key) || { total: 0, done: 0 }; current.total += item.total_qty * item.unit_price; current.done += Math.min(item.total_qty, item.completed_qty) * item.unit_price; systems.set(key, current); }
    const incomplete = items.filter((item) => item.completed_qty < item.total_qty).sort((a, b) => (b.total_qty - b.completed_qty) - (a.total_qty - a.completed_qty));
    const over = items.filter((item) => item.completed_qty > item.total_qty);
    sections.push(`[项目数据2｜工程量清单] 子目${items.length}项；已完成${items.filter((item) => item.completed_qty >= item.total_qty).length}项；未开始${items.filter((item) => item.completed_qty <= 0).length}项；未定价${items.filter((item) => item.unit_price <= 0).length}项；超合同量${over.length}项；${progressLabel}。\n子系统进度：${[...systems].map(([name, value]) => `${name}${value.total > 0 ? (value.done / value.total * 100).toFixed(1) : '0.0'}%`).join('；') || '暂无可计算数据'}。\n未完成重点：${incomplete.slice(0, 12).map((item) => `${item.code} ${item.name} ${item.completed_qty}/${item.total_qty}${item.unit}`).join('；') || '无'}。${over.length ? `\n超量项：${over.slice(0, 8).map((item) => `${item.code} ${item.name} ${item.completed_qty}/${item.total_qty}${item.unit}`).join('；')}` : ''}`);
  }

  const names = new Map(workers.map((worker) => [worker.id, worker.name]));
  if (wantsAttendance) {
    const rows = db.prepare(`SELECT a.worker_id, w.name, SUM(CASE a.attendance WHEN 'full' THEN 1 WHEN 'half' THEN 0.5 ELSE 0 END) AS days, SUM(a.overtime_hours) AS overtime, SUM(CASE WHEN a.attendance = 'absent' THEN 1 ELSE 0 END) AS absent_days FROM daily_attendance a JOIN workers w ON w.id = a.worker_id WHERE a.project_id = ? AND a.date BETWEEN ? AND ?${selectedWorker ? ' AND a.worker_id = ?' : ''} GROUP BY a.worker_id, w.name ORDER BY days DESC, overtime DESC, w.name`).all(...(selectedWorker ? [projectId, range.start, range.end, selectedWorker.id] : [projectId, range.start, range.end])) as Array<{ worker_id: string; name: string; days: number; overtime: number; absent_days: number }>;
    const totalOvertime = rows.reduce((sum, row) => sum + row.overtime, 0);
    sections.push(`[项目数据3｜考勤记录｜数据库精确聚合] 筛选：${selectedWorker ? selectedWorker.name : '全部人员'}；${range.label}实际出勤人数${rows.filter((row) => row.days > 0).length}人；累计出勤${rows.reduce((sum, row) => sum + row.days, 0)}人天；累计加班${totalOvertime}人·小时。\n人员明细：${rows.slice(0, 60).map((row) => `${row.name} 出勤${row.days}人天${row.overtime ? `、加班${row.overtime}人·小时` : ''}${row.absent_days ? `、未出勤记录${row.absent_days}天` : ''}`).join('；') || '该时间范围暂无考勤记录'}。`);
  }

  if (wantsReports) {
    const reportParams: string[] = [projectId, range.start, range.end];
    let reportFilter = '';
    if (selectedSystem) { reportFilter += ' AND system = ?'; reportParams.push(selectedSystem); }
    if (selectedWorker) { reportFilter += ' AND (workers LIKE ? OR work_items LIKE ?)'; reportParams.push(`%"${selectedWorker.id}"%`, `%"${selectedWorker.id}"%`); }
    if (selectedBom) { reportFilter += ' AND (work_items LIKE ? OR work_items LIKE ?)'; reportParams.push(`%${selectedBom.code}%`, `%${selectedBom.name}%`); }
    const rows = db.prepare(`SELECT date, location, work_type, quantity, unit, workers, weather, issue, notes, work_items, system FROM reports WHERE project_id = ? AND date BETWEEN ? AND ?${reportFilter} ORDER BY date DESC, created_at DESC`).all(...reportParams) as ReportRow[];
    let itemCount = 0; let externalCount = 0; const details: string[] = []; const issues: string[] = []; const quantities = new Map<string, number>();
    for (const row of rows) {
      const items = parseItems(row); itemCount += items.length;
      const reportWorkers = parseWorkerJson(row.workers);
      for (const item of items) {
        if (item.external === true) externalCount += 1;
        const quantityKey = `${String(item.name || row.work_type)}\u0000${String(item.unit || row.unit)}`;
        quantities.set(quantityKey, (quantities.get(quantityKey) || 0) + Number(item.quantity ?? row.quantity));
        const ids = workerIds(item.workers); const used = ids.length ? ids : reportWorkers;
        details.push(`${row.date}｜${row.system || '未指定系统'}｜${String(item.location || row.location)}｜${String(item.name || row.work_type)} ${Number(item.quantity ?? row.quantity)}${String(item.unit || row.unit)}｜人员：${used.map((id) => names.get(id) || '已移除人员').join('、') || '未记录'}${item.attendance === 'half' ? '｜半天' : ''}${Number(item.overtimeHours || 0) > 0 ? `｜加班${Number(item.overtimeHours)}小时/人` : ''}${item.external === true ? '｜合同外' : ''}${row.weather ? `｜天气${row.weather}` : ''}`);
      }
      const note = row.notes?.trim() || row.issue?.trim(); if (note) issues.push(`${row.date} ${row.location}：${note}`);
    }
    const quantitySummary = [...quantities].map(([key, quantity]) => { const [name, unit] = key.split('\u0000'); return `${name} ${quantity}${unit}`; });
    sections.push(`[项目数据4｜施工记录｜数据库精确聚合] 筛选：${[selectedSystem || '全部系统', selectedWorker?.name || '全部人员'].join('、')}；${range.label}共${rows.length}条报工、${itemCount}项施工内容、合同外施工${externalCount}项、有现场说明${issues.length}条。统计使用全部${rows.length}条记录，不受下方明细展示上限影响。\n工程量汇总：${quantitySummary.join('；') || '无'}。\n施工明细（最多展示60项）：\n${details.slice(0, 60).map((line) => `- ${line}`).join('\n') || '- 该时间范围暂无施工记录'}${issues.length ? `\n现场说明：\n${issues.slice(0, 15).map((line) => `- ${line}`).join('\n')}` : ''}`);
  }
  return sections.join('\n\n').slice(0, 18000);
}
