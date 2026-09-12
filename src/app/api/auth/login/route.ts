import { NextResponse } from 'next/server';
import { createSessionToken, type AppRole } from '@/lib/auth-core';
import { verifyPassword } from '@/lib/auth-password';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { clearPasswordFailures, findIpSecurity, getRequestIp, recordPasswordFailure } from '@/lib/ip-security';

initDbWithSeed();

interface AccountRow { id: string; username: string; display_name: string; password_hash: string | null; role: AppRole; status: 'pending' | 'active' | 'disabled' }

export async function POST(request: Request) {
  const body = await request.json() as { username?: unknown; password?: unknown; remember?: unknown };
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const db = getDb();
  const requestIp = getRequestIp(request);
  const ipSecurity = findIpSecurity(db, requestIp);
  if (ipSecurity?.blocked === 1) {
    await writeAuditLog(db, request, { module: 'auth', action: 'blocked_login', entityType: 'IP黑名单', entityId: requestIp,
      summary: `已拦截黑名单 IP 的登录请求：${requestIp}`, result: 'failure', operatorName: username || '未知用户' });
    return NextResponse.json({ error: '当前网络地址已被禁止登录，请联系管理员解除' }, { status: 403 });
  }
  const account = db.prepare(`SELECT id, username, display_name, password_hash, role, status
    FROM accounts WHERE username = ? COLLATE NOCASE`).get(username) as AccountRow | undefined;
  if (!account || !account.password_hash || !verifyPassword(password, account.password_hash)) {
    const security = recordPasswordFailure(db, requestIp);
    await writeAuditLog(db, request, { module: 'auth', action: 'login_failed', entityType: '账号', summary: `登录失败：${username || '未填写姓名'}`, result: 'failure', operatorName: username || '未知用户' });
    if (security?.blocked === 1) {
      await writeAuditLog(db, request, { module: 'auth', action: 'block_ip', entityType: 'IP黑名单', entityId: requestIp,
        summary: `密码连续错误5次，自动封禁 IP：${requestIp}`, result: 'failure', operatorName: '系统自动' });
      return NextResponse.json({ error: '密码连续错误5次，当前网络地址已被锁定，请联系管理员' }, { status: 403 });
    }
    const remaining = security ? Math.max(0, 5 - security.failed_attempts) : 5;
    return NextResponse.json({ error: `姓名或密码错误，还可尝试 ${remaining} 次` }, { status: 401 });
  }
  if (account.status === 'pending' || account.status === 'disabled') {
    await writeAuditLog(db, request, { module: 'auth', action: 'login_failed', entityType: '账号', entityId: account.id, summary: `登录失败：账号${account.status === 'pending' ? '待审核' : '已停用'}`, result: 'failure', operatorName: account.display_name, operatorId: account.id });
    return NextResponse.json({ error: account.status === 'pending' ? '账号正在等待管理员审核' : '账号已停用，请联系管理员' }, { status: 403 });
  }
  const user = { id: account.id, username: account.username, name: account.display_name, role: account.role };
  clearPasswordFailures(db, requestIp);
  const token = await createSessionToken(user, process.env.APP_SESSION_SECRET || '');
  const response = NextResponse.json({ success: true, user });
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const isHttps = forwardedProtocol ? forwardedProtocol === 'https' : new URL(request.url).protocol === 'https:';
  response.cookies.set('construction_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    ...(body.remember === false ? {} : { maxAge: 604800 }),
    path: '/',
  });
  await writeAuditLog(db, request, { module: 'auth', action: 'login', entityType: '账号', entityId: account.id, summary: '登录系统', operatorName: account.display_name, operatorId: account.id });
  return response;
}
