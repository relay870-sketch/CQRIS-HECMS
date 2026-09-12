import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { buildDailyAttendance, calculateRevertedQuantity } from '@/lib/report-rules';
import { getDb, initDbWithSeed } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth-core';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

interface WorkItem {
  name: string;
  code?: string;
  unit: string;
  quantity: number;
  location: string;
  attendance: 'full' | 'half' | 'none';
  overtimeHours: number;
  external: boolean;
  workers: string[];
  bomItemId?: string | null;
}

function parseWorkItems(input: unknown): WorkItem[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const items: WorkItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null;
    const it = raw as Record<string, unknown>;
    const name = typeof it.name === 'string' ? it.name.trim() : '';
    const unit = typeof it.unit === 'string' ? it.unit.trim() : '';
    const location = typeof it.location === 'string' ? it.location.trim() : '';
    const quantity = typeof it.quantity === 'number' ? it.quantity : NaN;
    if (!name || !unit || !location || !Number.isFinite(quantity) || quantity <= 0) return null;
    const overtimeHours = typeof it.overtimeHours === 'number' && it.overtimeHours > 0 ? it.overtimeHours : 0;
    const workers = Array.isArray(it.workers)
      ? [...new Set(it.workers.filter((w): w is string => typeof w === 'string'))]
      : [];
    items.push({
      name,
      code: typeof it.code === 'string' ? it.code : undefined,
      unit,
      quantity,
      location,
      attendance: it.attendance === 'half' ? 'half' : it.attendance === 'none' ? 'none' : 'full',
      overtimeHours,
      external: it.external === true,
      workers,
      bomItemId: typeof it.bomItemId === 'string' && it.bomItemId ? it.bomItemId : null,
    });
  }
  return items;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const date = searchParams.get('date');
  const workerId = searchParams.get('workerId');
  const db = getDb();
  let query = 'SELECT * FROM reports WHERE 1=1';
  const params: string[] = [];
  if (projectId) { query += ' AND project_id = ?'; params.push(projectId); }
  if (date) { query += ' AND date = ?'; params.push(date); }
  if (workerId) { query += ' AND workers LIKE ?'; params.push(`%"${workerId}"%`); }
  return NextResponse.json(db.prepare(`${query} ORDER BY date DESC, created_at DESC`).all(...params));
}

interface ReportRecord {
  id?: string;
  project_id: string;
  date?: string;
  bom_item_id: string | null;
  quantity: number;
  work_items: string | null;
  photos: string;
  workers?: string;
  weather?: string | null;
  notes?: string | null;
  system?: string | null;
}

function parseStoredWorkItems(value: string | null): WorkItem[] {
  try {
    return parseWorkItems(JSON.parse(value || '[]')) || [];
  } catch {
    return [];
  }
}

/** 根据仍存在的报工重建某天的自动考勤；管理员手动修正（source_report_id=NULL）保持不变。 */
function rebuildReportAttendance(db: import('better-sqlite3').Database, projectId: string, date: string): void {
  db.prepare(`DELETE FROM daily_attendance
    WHERE project_id = ? AND date = ? AND source_report_id IS NOT NULL`).run(projectId, date);
  const rows = db.prepare('SELECT id, workers, work_items FROM reports WHERE project_id = ? AND date = ?')
    .all(projectId, date) as Array<{ id: string; workers: string; work_items: string | null }>;
  const combined = new Map<string, { attendance: 'full' | 'half'; overtimeHours: number; reportId: string }>();
  for (const row of rows) {
    let items = parseStoredWorkItems(row.work_items);
    if (items.length === 0) {
      try {
        const workers: unknown = JSON.parse(row.workers || '[]');
        if (Array.isArray(workers)) {
          items = [{ name: '', unit: '', quantity: 0, location: '', attendance: 'full', overtimeHours: 0,
            external: false, workers: workers.filter((id): id is string => typeof id === 'string') }];
        }
      } catch { /* 忽略损坏的历史数据 */ }
    }
    for (const [workerId, attendance] of buildDailyAttendance(items)) {
      const current = combined.get(workerId);
      combined.set(workerId, {
        attendance: current?.attendance === 'full' || attendance.attendance === 'full' ? 'full' : 'half',
        overtimeHours: Math.max(current?.overtimeHours || 0, attendance.overtimeHours),
        reportId: row.id,
      });
    }
  }
  const insert = db.prepare(`INSERT INTO daily_attendance
    (id, project_id, worker_id, date, attendance, overtime_hours, source_report_id, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '报工自动生成', datetime('now'))
    ON CONFLICT(project_id, worker_id, date) DO UPDATE SET
      attendance = excluded.attendance, overtime_hours = excluded.overtime_hours,
      source_report_id = excluded.source_report_id, updated_by = excluded.updated_by, updated_at = datetime('now')
    WHERE daily_attendance.source_report_id IS NOT NULL`);
  for (const [workerId, value] of combined) {
    insert.run(randomUUID(), projectId, workerId, date, value.attendance, value.overtimeHours, value.reportId);
  }
}

/** 删除报工时回退关联清单的已完成量 */
function revertBomQuantity(db: import('better-sqlite3').Database, bomItemId: string | null, qty: number): void {
  if (!bomItemId || qty <= 0) return;
  const current = db.prepare('SELECT completed_qty FROM bom_items WHERE id = ?').get(bomItemId) as
    | { completed_qty: number }
    | undefined;
  if (!current) return;
  const next = calculateRevertedQuantity(current.completed_qty, qty);
  db.prepare('UPDATE bom_items SET completed_qty = ? WHERE id = ?').run(next, bomItemId);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: '缺少记录 ID' }, { status: 400 });
  }

  const db = getDb();
  const report = db.prepare('SELECT project_id, date, bom_item_id, quantity, work_items, photos FROM reports WHERE id = ?').get(id) as
    | ReportRecord
    | undefined;
  if (!report) {
    return NextResponse.json({ error: '记录不存在' }, { status: 404 });
  }

  db.transaction(() => {
    // 多条施工内容：逐条回退；旧单条格式：回退第一条
    let reverted = false;
    try {
      const items = JSON.parse(report.work_items || '[]') as Array<{ bomItemId?: string | null; quantity?: number }>;
      if (Array.isArray(items) && items.length > 0) {
        for (const it of items) {
          if (it.bomItemId && typeof it.quantity === 'number') {
            revertBomQuantity(db, it.bomItemId, it.quantity);
            reverted = true;
          }
        }
      }
    } catch {
      // work_items 解析失败则按单条处理
    }
    if (!reverted) {
      revertBomQuantity(db, report.bom_item_id, report.quantity);
    }

    // 必须先删自动考勤：报工删除后外键会把 source_report_id 置空，届时将无法与人工修正区分。
    db.prepare('DELETE FROM daily_attendance WHERE source_report_id = ?').run(id);
    db.prepare('DELETE FROM reports WHERE id = ?').run(id);
    rebuildReportAttendance(db, report.project_id, report.date || '');
  })();

  try {
    const photos: unknown = JSON.parse(report.photos || '[]');
    if (Array.isArray(photos)) {
      for (const photo of photos) {
        if (!photo || typeof photo !== 'object') continue;
        const name = (photo as Record<string, unknown>).name;
        if (typeof name !== 'string') continue;
        const abs = path.join(process.cwd(), 'data', 'photos', path.basename(report.project_id), path.basename(name));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      }
    }
  } catch (error) { console.error('清理报工照片失败:', error); }

  await writeAuditLog(db, request, { projectId: report.project_id, module: 'reports', action: 'delete',
    entityType: '施工记录', entityId: id, summary: `删除施工记录：${report.date || ''}`,
    before: report });

  return NextResponse.json({ success: true, message: '记录已删除' });
}

async function saveReport(request: Request, editId: string | null) {
  const cookieStore = await cookies();
  const sessionUser = await verifySessionToken(cookieStore.get('construction_session')?.value, process.env.APP_SESSION_SECRET || '');
  const submitterName = sessionUser?.name || '管理员';
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: '请求数据格式错误' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '请求数据格式错误' }, { status: 400 });
  const data = body as Record<string, unknown>;

  const { projectId, date, location } = data;
  if (
    typeof projectId !== 'string' || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof location !== 'string' || !location.trim()
  ) return NextResponse.json({ error: '请填写施工日期和施工位置' }, { status: 400 });

  // 解析施工内容：优先使用 workItems（多条），兼容旧的 workType/quantity/unit（单条）
  let workItems = parseWorkItems(data.workItems);
  if (!workItems) {
    const workType = typeof data.workType === 'string' ? data.workType.trim() : '';
    const unit = typeof data.unit === 'string' ? data.unit.trim() : '';
    const quantity = typeof data.quantity === 'number' ? data.quantity : NaN;
    if (!workType || !unit || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: '请至少填写一条施工内容，并确保工程量大于 0' }, { status: 400 });
    }
    workItems = [{
      name: workType,
      code: undefined,
      unit,
      quantity,
      location: location.trim(),
      attendance: 'full',
      overtimeHours: 0,
      external: false,
      workers: [],
      bomItemId: typeof data.bomItemId === 'string' && data.bomItemId ? data.bomItemId : null,
    }];
  }

  const db = getDb();
  if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
    return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  }

  // 参与人员（可选，方便现场快速填写）
  const rawWorkers = Array.isArray(data.workers) ? data.workers : [];
  const selectedWorkers = [...new Set(rawWorkers.filter((w): w is string => typeof w === 'string'))];
  if (selectedWorkers.length > 0) {
    const workerCount = db.prepare(`SELECT COUNT(*) AS count FROM workers WHERE project_id = ? AND id IN (${selectedWorkers.map(() => '?').join(',')})`).get(projectId, ...selectedWorkers) as { count: number };
    if (workerCount.count !== selectedWorkers.length) {
      return NextResponse.json({ error: '所选人员不属于当前项目' }, { status: 400 });
    }
  }

  const existing = editId
    ? db.prepare('SELECT id, project_id, date, bom_item_id, quantity, work_items, photos, workers, weather, notes, system FROM reports WHERE id = ?').get(editId) as ReportRecord | undefined
    : undefined;
  if (editId && (!existing || existing.project_id !== projectId)) {
    return NextResponse.json({ error: '要修改的报工记录不存在或不属于当前项目' }, { status: 404 });
  }
  const oldBomQuantities = new Map<string, number>();
  if (existing) {
    const oldItems = parseStoredWorkItems(existing.work_items);
    if (oldItems.length > 0) {
      for (const item of oldItems) {
        if (item.bomItemId) oldBomQuantities.set(item.bomItemId, (oldBomQuantities.get(item.bomItemId) || 0) + item.quantity);
      }
    } else if (existing.bom_item_id) {
      oldBomQuantities.set(existing.bom_item_id, existing.quantity);
    }
  }

  // 校验关联的清单子目（编辑时先扣除本记录原来的贡献）
  const first = workItems[0];
  const bomUpdates = new Map<string, number>();
  for (const item of workItems) {
    if (!item.bomItemId) continue;
    const bom = db.prepare('SELECT project_id, total_qty, completed_qty, unit FROM bom_items WHERE id = ?').get(item.bomItemId) as
      | { project_id: string; total_qty: number; completed_qty: number; unit: string }
      | undefined;
    if (!bom || bom.project_id !== projectId) {
      return NextResponse.json({ error: `施工内容「${item.name}」关联的清单子目不属于当前项目` }, { status: 400 });
    }
    if (bom.unit !== item.unit) {
      return NextResponse.json({ error: `「${item.name}」的计量单位为“${bom.unit}”，请保持一致` }, { status: 400 });
    }
    const acc = (bomUpdates.get(item.bomItemId) || 0) + item.quantity;
    const effectiveCompleted = Math.max(0, bom.completed_qty - (oldBomQuantities.get(item.bomItemId) || 0));
    if (effectiveCompleted + acc > bom.total_qty) {
      return NextResponse.json({ error: `「${item.name}」报工工程量超出清单剩余量（${bom.total_qty - effectiveCompleted}${bom.unit}）` }, { status: 400 });
    }
    bomUpdates.set(item.bomItemId, acc);
  }

  const id = editId || `r${Date.now()}`;
  const storedWorkItems = workItems.map((w) => ({
    name: w.name,
    code: w.code || null,
    unit: w.unit,
    quantity: w.quantity,
    location: w.location,
    attendance: w.attendance,
    overtimeHours: w.overtimeHours,
    external: w.external,
    workers: w.workers,
    bomItemId: w.bomItemId || null,
  }));

  db.transaction(() => {
    if (existing) {
      for (const [bomItemId, qty] of oldBomQuantities) revertBomQuantity(db, bomItemId, qty);
      db.prepare(`UPDATE reports SET date=?, location=?, lane=?, device_point=?, work_type=?, quantity=?, unit=?, bom_item_id=?, workers=?, weather=?, issue=?, photos=?, notes=?, work_items=?, system=? WHERE id=?`)
        .run(date, first.location, typeof data.lane === 'string' && data.lane ? data.lane : null,
          typeof data.devicePoint === 'string' && data.devicePoint ? data.devicePoint : null, first.name, first.quantity,
          first.unit, first.bomItemId || null, JSON.stringify(selectedWorkers),
          typeof data.weather === 'string' && data.weather ? data.weather : null,
          typeof data.issue === 'string' && data.issue.trim() ? data.issue.trim() : null,
          JSON.stringify(Array.isArray(data.photos) ? data.photos : []),
          typeof data.notes === 'string' && data.notes.trim() ? data.notes.trim() : null,
          JSON.stringify(storedWorkItems), typeof data.system === 'string' && data.system.trim() ? data.system.trim() : null, id);
    } else {
      db.prepare(`INSERT INTO reports (id, project_id, date, location, lane, device_point, work_type, quantity, unit, bom_item_id, workers, weather, issue, quality_checks, photos, notes, submitter, work_items, system) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        id,
        projectId,
        date,
        first.location,
        typeof data.lane === 'string' && data.lane ? data.lane : null,
        typeof data.devicePoint === 'string' && data.devicePoint ? data.devicePoint : null,
        first.name,
        first.quantity,
        first.unit,
        first.bomItemId || null,
        JSON.stringify(selectedWorkers),
        typeof data.weather === 'string' && data.weather ? data.weather : null,
        typeof data.issue === 'string' && data.issue.trim() ? data.issue.trim() : null,
        JSON.stringify([]),
        JSON.stringify(Array.isArray(data.photos) ? data.photos : []),
        typeof data.notes === 'string' && data.notes.trim() ? data.notes.trim() : null,
        submitterName,
        JSON.stringify(storedWorkItems),
        typeof data.system === 'string' && data.system.trim() ? data.system.trim() : null,
      );
    }
    for (const [bomItemId, acc] of bomUpdates) {
      db.prepare('UPDATE bom_items SET completed_qty = completed_qty + ? WHERE id = ?').run(acc, bomItemId);
    }

    if (existing?.date && existing.date !== date) rebuildReportAttendance(db, projectId, existing.date);
    rebuildReportAttendance(db, projectId, date);
  })();

  if (existing) {
    try {
      const oldPhotos: unknown = JSON.parse(existing.photos || '[]');
      const newPhotos = Array.isArray(data.photos) ? data.photos : [];
      const retained = new Set(newPhotos.flatMap((photo) => photo && typeof photo === 'object' && typeof (photo as Record<string, unknown>).name === 'string' ? [(photo as Record<string, unknown>).name as string] : []));
      if (Array.isArray(oldPhotos)) for (const photo of oldPhotos) {
        if (!photo || typeof photo !== 'object') continue;
        const name = (photo as Record<string, unknown>).name;
        if (typeof name !== 'string' || retained.has(name)) continue;
        const abs = path.join(process.cwd(), 'data', 'photos', path.basename(projectId), path.basename(name));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      }
    } catch (error) { console.error('清理已移除的报工照片失败:', error); }
  }

  const oldStoredItems = existing ? parseStoredWorkItems(existing.work_items) : [];
  const auditWorkerIds = [...new Set([...selectedWorkers, ...oldStoredItems.flatMap((item) => item.workers)])];
  const workerRows = auditWorkerIds.length > 0
    ? db.prepare(`SELECT id, name FROM workers WHERE id IN (${auditWorkerIds.map(() => '?').join(',')})`).all(...auditWorkerIds) as Array<{ id: string; name: string }>
    : [];
  const workerNames = new Map(workerRows.map((worker) => [worker.id, worker.name]));
  const toReadableItem = (item: WorkItem) => ({ name: item.name, code: item.code, unit: item.unit,
    quantity: item.quantity, location: item.location, attendance: item.attendance,
    overtimeHours: item.overtimeHours, external: item.external,
    workers: item.workers.map((workerId) => workerNames.get(workerId) || '已移除人员') });
  const readableItems = workItems.map(toReadableItem);
  const oldItems = existing ? oldStoredItems.map(toReadableItem) : undefined;
  let oldPhotoCount = 0;
  if (existing) {
    try { const parsed: unknown = JSON.parse(existing.photos || '[]'); oldPhotoCount = Array.isArray(parsed) ? parsed.length : 0; }
    catch { oldPhotoCount = 0; }
  }
  await writeAuditLog(db, request, { projectId, module: 'reports', action: existing ? 'update' : 'create',
    entityType: '施工记录', entityId: id,
    summary: `${existing ? '修改' : '新增'}报工：${date}，${storedWorkItems.length}项施工内容，${selectedWorkers.length}人`,
    before: existing ? { date: existing.date, system: existing.system, workItems: oldItems, weather: existing.weather,
      notes: existing.notes, photoCount: oldPhotoCount } : undefined,
    after: { date, system: data.system, workItems: readableItems, workers: selectedWorkers.map((workerId) => workerNames.get(workerId) || '已移除人员'),
      weather: data.weather, notes: data.notes, photoCount: Array.isArray(data.photos) ? data.photos.length : 0 } });

  return NextResponse.json({ success: true, id, updated: !!existing });
}

export async function POST(request: Request) {
  return saveReport(request, null);
}

export async function PUT(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少记录 ID' }, { status: 400 });
  return saveReport(request, id);
}
