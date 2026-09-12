import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth-core';

export async function GET() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get('construction_session')?.value, process.env.APP_SESSION_SECRET || '');
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  return NextResponse.json({ user });
}
