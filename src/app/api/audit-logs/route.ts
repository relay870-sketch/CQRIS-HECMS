import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth-core';

initDbWithSeed();

export async function GET(request: Request) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)construction_session=([^;]+)/)?.[1];
  const user = await verifySessionToken(token ? decodeURIComponent(token) : undefined, process.env.APP_SESSION_SECRET || '');
  if (!user || !['admin', 'viewer'].includes(user.role)) return NextResponse.json({ error: '没有权限查看操作日志' }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const db = getDb();
  if (params.get('summary') === '1') {
    const failed24h = (db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE result = 'failure' AND created_at >= datetime('now', '-1 day')").get() as { count: number }).count;
    const loginFailed30m = (db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'login_failed' AND created_at >= datetime('now', '-30 minutes')").get() as { count: number }).count;
    const deletes24h = (db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'delete' AND created_at >= datetime('now', '-1 day')").get() as { count: number }).count;
    const recentAlerts = db.prepare(`SELECT id, detail, operator, ip_address, created_at FROM audit_logs
      WHERE result = 'failure' OR action = 'delete' ORDER BY created_at DESC LIMIT 8`).all();
    return NextResponse.json({ failed24h, loginFailed30m, deletes24h, recentAlerts,
      riskLevel: loginFailed30m >= 5 || failed24h >= 5 || deletes24h >= 10 ? 'high' : failed24h > 0 || loginFailed30m > 0 || deletes24h >= 3 ? 'medium' : 'normal' });
  }
  const conditions: string[] = [];
  const values: string[] = [];
  for (const [column, value] of [['project_id', params.get('projectId')], ['module', params.get('module')], ['action', params.get('action')], ['result', params.get('result')]]) {
    if (value) { conditions.push(`l.${column} = ?`); values.push(value); }
  }
  const start = params.get('start');
  const end = params.get('end');
  const keyword = params.get('keyword');
  if (start) { conditions.push('l.created_at >= ?'); values.push(`${start} 00:00:00`); }
  if (end) { conditions.push('l.created_at <= ?'); values.push(`${end} 23:59:59`); }
  if (keyword) { conditions.push('(l.detail LIKE ? OR l.operator LIKE ? OR l.entity_type LIKE ? OR p.name LIKE ?)'); values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const scope = params.get('scope');
  const table = scope === 'archive' ? 'audit_log_archive' : 'audit_logs';
  const rows = db.prepare(`SELECT l.id, l.project_id, p.name AS project_name, l.action, l.entity_type, l.entity_id, l.detail, l.operator, l.created_at,
    l.operator_id, l.module, l.result, l.ip_address, l.user_agent, l.before_data, l.after_data, l.device_type, l.browser
    FROM ${table} l LEFT JOIN projects p ON p.id = l.project_id ${where} ORDER BY l.created_at DESC LIMIT 1000`).all(...values) as Array<Record<string, unknown>>;
  // 兼容早期日志：当时参与人员保存的是 w... 内部编号，返回页面前统一替换为姓名。
  const workers = db.prepare('SELECT id, name FROM workers').all() as Array<{ id: string; name: string }>;
  const workerNames = new Map(workers.map((worker) => [worker.id, worker.name]));
  const replaceWorkerIds = (value: unknown): unknown => {
    if (typeof value !== 'string' || !value) return value;
    return value.replace(/w\d{8,}/g, (workerId) => workerNames.get(workerId) || '已移除人员');
  };
  return NextResponse.json(rows.map((row) => ({
    ...row,
    detail: replaceWorkerIds(row.detail),
    before_data: replaceWorkerIds(row.before_data),
    after_data: replaceWorkerIds(row.after_data),
  })));
}
