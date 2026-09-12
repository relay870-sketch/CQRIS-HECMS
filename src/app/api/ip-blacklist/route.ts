import { isIP } from 'net';
import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth-core';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

async function requireAdmin(request: Request) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)construction_session=([^;]+)/)?.[1];
  return verifySessionToken(token ? decodeURIComponent(token) : undefined, process.env.APP_SESSION_SECRET || '');
}

export async function GET(request: Request) {
  const user = await requireAdmin(request);
  if (user?.role !== 'admin') return NextResponse.json({ error: '仅管理员可管理 IP 黑名单' }, { status: 403 });
  const rows = getDb().prepare(`SELECT * FROM auth_ip_security
    WHERE blocked = 1 OR failed_attempts > 0 ORDER BY blocked DESC, updated_at DESC LIMIT 500`).all();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const user = await requireAdmin(request);
  if (user?.role !== 'admin') return NextResponse.json({ error: '仅管理员可管理 IP 黑名单' }, { status: 403 });
  const body = await request.json() as { ipAddress?: unknown; reason?: unknown };
  const ipAddress = typeof body.ipAddress === 'string' ? body.ipAddress.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!isIP(ipAddress)) return NextResponse.json({ error: '请输入有效的 IPv4 或 IPv6 地址' }, { status: 400 });
  if (!reason) return NextResponse.json({ error: '请填写加入黑名单的原因' }, { status: 400 });
  const db = getDb();
  db.prepare(`INSERT INTO auth_ip_security
    (ip_address, failed_attempts, blocked, blocked_reason, blocked_at, blocked_by, updated_at)
    VALUES (?, 0, 1, ?, datetime('now'), ?, datetime('now'))
    ON CONFLICT(ip_address) DO UPDATE SET blocked = 1, blocked_reason = excluded.blocked_reason,
      blocked_at = datetime('now'), blocked_by = excluded.blocked_by, updated_at = datetime('now')`)
    .run(ipAddress, reason, user.name);
  await writeAuditLog(db, request, { module: 'accounts', action: 'block_ip', entityType: 'IP黑名单', entityId: ipAddress,
    summary: `手动加入 IP 黑名单：${ipAddress}；原因：${reason}`, operatorName: user.name, operatorId: user.id,
    after: { ipAddress, reason, blockedBy: user.name } });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await requireAdmin(request);
  if (user?.role !== 'admin') return NextResponse.json({ error: '仅管理员可管理 IP 黑名单' }, { status: 403 });
  const ipAddress = new URL(request.url).searchParams.get('ip')?.trim() || '';
  if (!isIP(ipAddress)) return NextResponse.json({ error: 'IP 地址无效' }, { status: 400 });
  const db = getDb();
  const before = db.prepare('SELECT * FROM auth_ip_security WHERE ip_address = ?').get(ipAddress);
  const result = db.prepare(`UPDATE auth_ip_security SET blocked = 0, failed_attempts = 0,
    last_failed_at = NULL, blocked_reason = NULL, blocked_at = NULL, blocked_by = NULL, updated_at = datetime('now')
    WHERE ip_address = ?`).run(ipAddress);
  if (result.changes === 0) return NextResponse.json({ error: '该 IP 不在安全记录中' }, { status: 404 });
  await writeAuditLog(db, request, { module: 'accounts', action: 'unblock_ip', entityType: 'IP黑名单', entityId: ipAddress,
    summary: `解除 IP 黑名单：${ipAddress}`, operatorName: user.name, operatorId: user.id, before,
    after: { ipAddress, blocked: false, failedAttempts: 0 } });
  return NextResponse.json({ success: true });
}
