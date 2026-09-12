import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

// GET /api/locations?projectId=xxx - 只读取后台正式录入的桩号库
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: '缺少项目 ID' }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(`
    SELECT id, name FROM project_locations
    WHERE project_id = ?
    ORDER BY created_at DESC, name ASC
    LIMIT 500
  `).all(projectId);
  return NextResponse.json(result);
}

// POST /api/locations - 添加/批量导入桩号（body: { projectId, names: string[] }）
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { projectId?: unknown; names?: unknown };
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    const names = Array.isArray(body.names)
      ? body.names.filter((n): n is string => typeof n === 'string').map((n) => n.trim()).filter(Boolean)
      : [];

    if (!projectId || names.length === 0) {
      return NextResponse.json({ error: '缺少项目 ID 或桩号内容' }, { status: 400 });
    }

    const db = getDb();
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const existing = new Set(
      (db.prepare('SELECT name FROM project_locations WHERE project_id = ?').all(projectId) as Array<{ name: string }>)
        .map((r) => r.name),
    );

    let added = 0;
    const insert = db.prepare('INSERT INTO project_locations (id, project_id, name) VALUES (?, ?, ?)');
    const insertMany = db.transaction((list: string[]) => {
      for (const name of list) {
        if (existing.has(name)) continue;
        existing.add(name);
        insert.run(randomUUID(), projectId, name);
        added++;
      }
    });
    insertMany([...new Set(names)]);

    await writeAuditLog(db, request, { projectId, module: 'locations', action: names.length > 1 ? 'import' : 'create', entityType: '桩号', summary: `${names.length > 1 ? '批量导入' : '新增'}桩号：成功 ${added} 条`, after: names });

    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.error('添加桩号失败:', error);
    await writeAuditLog(getDb(), request, { module: 'locations', action: 'import', entityType: '桩号', summary: `桩号添加或导入失败：${error instanceof Error ? error.message : '未知错误'}`, result: 'failure' });
    return NextResponse.json({ error: '添加桩号失败' }, { status: 500 });
  }
}

// DELETE /api/locations?id=xxx - 删除正式桩号库记录
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: '缺少桩号 ID' }, { status: 400 });
  }

  const db = getDb();
  const before = db.prepare('SELECT * FROM project_locations WHERE id = ?').get(id) as { project_id?: string; name?: string } | undefined;
  const result = db.prepare('DELETE FROM project_locations WHERE id = ?').run(id);
  if (result.changes === 0) return NextResponse.json({ error: '桩号不存在' }, { status: 404 });
  await writeAuditLog(db, request, { projectId: before?.project_id, module: 'locations', action: 'delete', entityType: '桩号', entityId: id, summary: `删除桩号：${before?.name || id}`, before });
  return NextResponse.json({ success: true, message: '桩号已删除' });
}
