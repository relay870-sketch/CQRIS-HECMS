import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

export async function POST(request: Request) {
  await writeAuditLog(getDb(), request, { module: 'auth', action: 'logout', entityType: '账号', summary: '退出系统' });
  const response = NextResponse.json({ success: true });
  response.cookies.set('construction_session', '', { expires: new Date(0), path: '/' });
  return response;
}
