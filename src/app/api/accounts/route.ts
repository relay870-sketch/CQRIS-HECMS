import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

type AccountStatus = 'pending' | 'active' | 'disabled';
type AccountRole = 'reporter' | 'viewer';

export async function GET() {
  return NextResponse.json(getDb().prepare(`SELECT id, username, display_name, role, status, created_at, reviewed_at
    FROM accounts ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, created_at DESC`).all());
}

export async function PATCH(request: Request) {
  const body = await request.json() as { id?: unknown; status?: unknown; role?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  const status = body.status as AccountStatus;
  const role = body.role as AccountRole;
  if (!id || !['pending', 'active', 'disabled'].includes(status) || !['reporter', 'viewer'].includes(role)) {
    return NextResponse.json({ error: '账号设置无效' }, { status: 400 });
  }
  const db = getDb();
  const before = db.prepare('SELECT id, username, display_name, role, status FROM accounts WHERE id = ?').get(id);
  const result = db.prepare(`UPDATE accounts SET status = ?, role = ?, reviewed_at = datetime('now'), reviewed_by = 'admin'
    WHERE id = ? AND role != 'admin'`).run(status, role, id);
  if (result.changes === 0) return NextResponse.json({ error: '账号不存在或不能修改管理员账号' }, { status: 404 });
  const after = db.prepare('SELECT id, username, display_name, role, status FROM accounts WHERE id = ?').get(id);
  await writeAuditLog(db, request, { module: 'accounts', action: 'review', entityType: '账号', entityId: id, summary: `账号审核：状态设为 ${status}，角色设为 ${role}`, before, after });
  return NextResponse.json({ success: true });
}
