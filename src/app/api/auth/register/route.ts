import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { hashPassword, validatePassword } from '@/lib/auth-password';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

export async function POST(request: Request) {
  const body = await request.json() as { displayName?: unknown; password?: unknown; confirmPassword?: unknown };
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const username = displayName;
  const password = typeof body.password === 'string' ? body.password : '';
  if (displayName.length < 2 || displayName.length > 20) return NextResponse.json({ error: '姓名需为 2–20 个字符' }, { status: 400 });
  if (displayName.toLowerCase() === 'admin') return NextResponse.json({ error: '该姓名为系统管理员账号，请使用其他姓名' }, { status: 400 });
  if (password !== body.confirmPassword) return NextResponse.json({ error: '两次输入的密码不一致' }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  try {
    const db = getDb();
    const id = randomUUID();
    db.prepare(`INSERT INTO accounts (id, username, display_name, password_hash, role, status)
      VALUES (?, ?, ?, ?, 'reporter', 'pending')`).run(id, username, displayName, hashPassword(password));
    await writeAuditLog(db, request, { module: 'accounts', action: 'create', entityType: '账号', entityId: id, summary: `用户注册：${displayName}，等待审核`, operatorName: displayName, operatorId: id, after: { displayName, role: 'reporter', status: 'pending' } });
    return NextResponse.json({ success: true, message: '注册成功，请等待管理员审核' }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /UNIQUE/i.test(error.message)) return NextResponse.json({ error: '该姓名已经注册，请直接登录或联系管理员' }, { status: 409 });
    throw error;
  }
}
