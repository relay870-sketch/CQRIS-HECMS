import { NextResponse } from 'next/server';
import { hashPassword, validatePassword } from '@/lib/auth-password';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

export async function POST(request: Request) {
  const body = await request.json() as { password?: unknown; confirmPassword?: unknown };
  const password = typeof body.password === 'string' ? body.password : '';
  if (password !== body.confirmPassword) return NextResponse.json({ error: '两次输入的密码不一致' }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  const db = getDb();
  const admin = db.prepare("SELECT password_hash FROM accounts WHERE username = 'admin'").get() as { password_hash: string | null } | undefined;
  if (!admin || admin.password_hash) return NextResponse.json({ error: '管理员密码已设置' }, { status: 409 });
  db.prepare("UPDATE accounts SET password_hash = ? WHERE username = 'admin'").run(hashPassword(password));
  await writeAuditLog(db, request, { module: 'accounts', action: 'update', entityType: '管理员账号', summary: '完成管理员首次密码设置', operatorName: '管理员' });
  return NextResponse.json({ success: true });
}
