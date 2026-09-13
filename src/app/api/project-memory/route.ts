import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth-core';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import {
  clearProjectMemory,
  getProjectMemory,
  replaceProjectMemory,
  type ProjectMemoryCategory,
  type ProjectMemorySnapshot,
} from '@/lib/knowledge-tools';

initDbWithSeed();

const categories: ProjectMemoryCategory[] = ['facts', 'preferences', 'open_issues', 'decisions'];
const categoryNames: Record<ProjectMemoryCategory, string> = {
  facts: '重要事实',
  preferences: '施工偏好',
  open_issues: '遗留问题',
  decisions: '关键结论',
};

async function requireAdmin(request: Request) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)construction_session=([^;]+)/)?.[1];
  return verifySessionToken(token ? decodeURIComponent(token) : undefined, process.env.APP_SESSION_SECRET || '');
}

function projectExists(projectId: string): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId));
}

function normalizeMemory(value: unknown): ProjectMemorySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: ProjectMemorySnapshot = { facts: [], preferences: [], open_issues: [], decisions: [] };
  for (const category of categories) {
    if (!Array.isArray(source[category]) || !(source[category] as unknown[]).every((item) => typeof item === 'string')) return null;
    result[category] = (source[category] as string[])
      .map((item) => item.trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 12);
  }
  return result;
}

export async function GET(request: Request) {
  const user = await requireAdmin(request);
  if (!user || !['admin', 'viewer'].includes(user.role)) return NextResponse.json({ error: '没有权限查看长期记忆' }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  if (!projectId || !projectExists(projectId)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ success: true, memory: getProjectMemory(projectId) });
}

export async function PUT(request: Request) {
  if ((await requireAdmin(request))?.role !== 'admin') return NextResponse.json({ error: '仅管理员可管理长期记忆' }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const memory = normalizeMemory(body.memory);
  if (!projectId || !projectExists(projectId)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  if (!memory) return NextResponse.json({ error: '长期记忆内容格式不正确' }, { status: 400 });
  const action = body.action === 'add' || body.action === 'edit' || body.action === 'delete' ? body.action : 'update';
  const category = categories.includes(body.category as ProjectMemoryCategory) ? body.category as ProjectMemoryCategory : null;
  const actionName = { add: '新增', edit: '修改', delete: '删除', update: '更新' }[action];
  replaceProjectMemory(projectId, memory);
  await writeAuditLog(getDb(), request, {
    projectId,
    module: 'system',
    action,
    entityType: '项目长期记忆',
    summary: `${actionName}${category ? categoryNames[category] : '项目长期记忆'}`,
  });
  return NextResponse.json({ success: true, memory });
}

export async function DELETE(request: Request) {
  if ((await requireAdmin(request))?.role !== 'admin') return NextResponse.json({ error: '仅管理员可管理长期记忆' }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  if (!projectId || !projectExists(projectId)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  clearProjectMemory(projectId);
  await writeAuditLog(getDb(), request, {
    projectId,
    module: 'system',
    action: 'delete',
    entityType: '项目长期记忆',
    summary: '清空当前项目全部长期记忆',
  });
  return NextResponse.json({ success: true });
}
