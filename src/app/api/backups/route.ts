import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth-core';
import { createBackup, deleteBackup, ensureDailyBackup, listBackups, resolveBackup, restoreBackup } from '@/lib/backups';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<boolean> {
  const store = await cookies();
  const user = await verifySessionToken(store.get('construction_session')?.value, process.env.APP_SESSION_SECRET || '');
  return user?.role === 'admin';
}

async function currentRole(): Promise<'admin' | 'reporter' | 'viewer' | null> {
  const store = await cookies();
  const user = await verifySessionToken(store.get('construction_session')?.value, process.env.APP_SESSION_SECRET || '');
  return user?.role || null;
}

export async function GET(request: Request) {
  const role = await currentRole();
  if (role !== 'admin' && role !== 'viewer') return NextResponse.json({ error: '没有权限查看数据备份' }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const download = params.get('download');
  if (download) {
    try {
      const file = resolveBackup(download);
      if (!fs.existsSync(file)) return NextResponse.json({ error: '备份文件不存在' }, { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${path.basename(file)}"`, 'Content-Length': String(fs.statSync(file).size) } });
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '下载失败' }, { status: 400 }); }
  }
  if (role === 'admin') try { await ensureDailyBackup(); } catch (error) { console.error('自动备份失败:', error); }
  const backups = listBackups();
  return NextResponse.json({ backups, latest: backups[0] || null });
}

export async function POST(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: '仅管理员可管理数据备份' }, { status: 403 });
  try {
    const type = request.headers.get('content-type') || '';
    if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024 * 1024) return NextResponse.json({ error: '请选择不超过2GB的备份文件' }, { status: 400 });
      const temp = path.join(os.tmpdir(), `cqris-upload-${randomUUID()}.tar.gz`);
      try {
        fs.writeFileSync(temp, Buffer.from(await file.arrayBuffer()));
        await restoreBackup(temp);
      } finally { fs.rmSync(temp, { force: true }); }
      await writeAuditLog(getDb(), request, { module: 'system', action: 'restore', entityType: '数据备份', summary: `上传并恢复数据备份：${file.name}` });
      return NextResponse.json({ success: true, message: '数据恢复成功，恢复前数据已自动备份' });
    }
    const body = await request.json() as { action?: unknown; name?: unknown };
    if (body.action === 'create') {
      const backup = await createBackup('manual');
      await writeAuditLog(getDb(), request, { module: 'system', action: 'backup', entityType: '数据备份', summary: `手动创建数据备份：${backup.name}` });
      return NextResponse.json({ success: true, backup });
    }
    if (body.action === 'restore' && typeof body.name === 'string') {
      const file = resolveBackup(body.name);
      if (!fs.existsSync(file)) return NextResponse.json({ error: '备份文件不存在' }, { status: 404 });
      await restoreBackup(file);
      await writeAuditLog(getDb(), request, { module: 'system', action: 'restore', entityType: '数据备份', summary: `恢复数据备份：${body.name}` });
      return NextResponse.json({ success: true, message: '数据恢复成功，恢复前数据已自动备份' });
    }
    return NextResponse.json({ error: '不支持的备份操作' }, { status: 400 });
  } catch (error) {
    console.error('备份操作失败:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '备份操作失败' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: '仅管理员可管理数据备份' }, { status: 403 });
  const name = new URL(request.url).searchParams.get('name');
  if (!name) return NextResponse.json({ error: '缺少备份文件名' }, { status: 400 });
  try {
    deleteBackup(name);
    await writeAuditLog(getDb(), request, { module: 'system', action: 'delete', entityType: '数据备份', summary: `删除备份文件：${name}` });
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '删除失败' }, { status: 400 }); }
}
