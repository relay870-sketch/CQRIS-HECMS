import { NextRequest, NextResponse } from 'next/server';
import { authEnabled, verifySessionToken } from '@/lib/auth-core';
import { reporterCanWrite } from '@/lib/role-permissions';

const publicPaths = ['/login', '/board', '/chongqing-ruisi-logo.png', '/api/public/board', '/api/auth/login', '/api/auth/register', '/api/auth/status', '/api/auth/setup'];

function reporterCanOpenManage(path: string): boolean {
  return ['/manage/projects', '/manage/workers', '/manage/locations', '/manage/attendance', '/manage/systems', '/manage/bom']
    .some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

export async function proxy(request: NextRequest) {
  if (!authEnabled() || publicPaths.some((path) => request.nextUrl.pathname.startsWith(path))) return NextResponse.next();
  const user = await verifySessionToken(request.cookies.get('construction_session')?.value, process.env.APP_SESSION_SECRET || '');
  if (!user) {
    if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const login = new URL('/login', request.url); login.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  const isWrite = request.nextUrl.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (isWrite && user.role === 'viewer') return NextResponse.json({ error: '只读账号不能修改数据' }, { status: 403 });
  if (isWrite && user.role === 'reporter' && !reporterCanWrite(request.method, request.nextUrl.pathname)) {
    return NextResponse.json({ error: '报工账号没有管理权限' }, { status: 403 });
  }
  if (request.nextUrl.pathname.startsWith('/manage/') && user.role === 'reporter' && !reporterCanOpenManage(request.nextUrl.pathname)) return NextResponse.redirect(new URL('/', request.url));
  const response = NextResponse.next(); response.headers.set('x-app-role', user.role); response.headers.set('x-app-user-id', user.id); return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
