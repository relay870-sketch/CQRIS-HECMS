import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

type AttendanceStatus = 'full' | 'half' | 'absent';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const date = searchParams.get('date');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  if (!projectId) return NextResponse.json({ error: '缺少项目 ID' }, { status: 400 });
  const db = getDb();
  let sql = `SELECT a.*, w.name AS worker_name, w.team, w.role
    FROM daily_attendance a JOIN workers w ON w.id = a.worker_id
    WHERE a.project_id = ?`;
  const params: string[] = [projectId];
  if (date) { sql += ' AND a.date = ?'; params.push(date); }
  if (dateFrom) { sql += ' AND a.date >= ?'; params.push(dateFrom); }
  if (dateTo) { sql += ' AND a.date <= ?'; params.push(dateTo); }
  sql += ' ORDER BY a.date DESC, w.team, w.name';
  return NextResponse.json(db.prepare(sql).all(...params));
}

export async function PUT(request: Request) {
  const body = await request.json() as { projectId?: unknown; date?: unknown; entries?: unknown; reason?: unknown };
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '';
  if (!projectId || !date || !Array.isArray(body.entries)) {
    return NextResponse.json({ error: '项目、日期或考勤数据无效' }, { status: 400 });
  }
  const entries: Array<{ workerId: string; attendance: AttendanceStatus; overtimeHours: number }> = [];
  for (const raw of body.entries) {
    if (!raw || typeof raw !== 'object') return NextResponse.json({ error: '考勤数据格式错误' }, { status: 400 });
    const item = raw as Record<string, unknown>;
    const status = item.attendance;
    const overtime = Number(item.overtimeHours ?? 0);
    if (typeof item.workerId !== 'string' || !['full', 'half', 'absent'].includes(String(status)) || !Number.isFinite(overtime) || overtime < 0 || overtime > 24) {
      return NextResponse.json({ error: '考勤状态或加班小时无效' }, { status: 400 });
    }
    entries.push({ workerId: item.workerId, attendance: status as AttendanceStatus, overtimeHours: overtime });
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return NextResponse.json({ error: '请填写修正原因' }, { status: 400 });
  const db = getDb();
  const validWorkers = db.prepare('SELECT id FROM workers WHERE project_id = ?').all(projectId) as Array<{ id: string }>;
  const validIds = new Set(validWorkers.map((worker) => worker.id));
  if (entries.some((entry) => !validIds.has(entry.workerId))) return NextResponse.json({ error: '包含不属于当前项目的人员' }, { status: 400 });

  db.transaction(() => {
    const upsert = db.prepare(`INSERT INTO daily_attendance
      (id, project_id, worker_id, date, attendance, overtime_hours, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '管理员', datetime('now'))
      ON CONFLICT(project_id, worker_id, date) DO UPDATE SET
        attendance = excluded.attendance, overtime_hours = excluded.overtime_hours,
        source_report_id = NULL, updated_by = '管理员', updated_at = datetime('now')`);
    for (const entry of entries) upsert.run(randomUUID(), projectId, entry.workerId, date, entry.attendance, entry.overtimeHours);
  })();
  await writeAuditLog(db, request, { projectId, module: 'attendance', action: 'manual_update', entityType: '考勤',
    summary: `人工修正 ${date} 考勤：${entries.length}人；原因：${reason}`, after: entries });
  return NextResponse.json({ success: true });
}
