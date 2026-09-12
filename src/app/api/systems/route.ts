import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

// GET /api/systems?projectId=xxx - 项目子系统列表
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: '缺少项目 ID' }, { status: 400 });
  }
  const db = getDb();
  const systems = db.prepare(`
    SELECT id, name, sort_order FROM project_systems
    WHERE project_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(projectId);
  return NextResponse.json(systems);
}

// POST /api/systems - 全量保存项目子系统列表（body: { projectId, names: string[] }）
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { projectId?: unknown; names?: unknown };
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    const names = Array.isArray(body.names)
      ? [...new Set(body.names.filter((n): n is string => typeof n === 'string').map((n) => n.trim()).filter(Boolean))]
      : [];

    if (!projectId) {
      return NextResponse.json({ error: '缺少项目 ID' }, { status: 400 });
    }
    if (names.length === 0) {
      return NextResponse.json({ error: '请至少保留一个子系统' }, { status: 400 });
    }

    const db = getDb();
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const before = (db.prepare('SELECT name FROM project_systems WHERE project_id = ? ORDER BY sort_order').all(projectId) as Array<{ name: string }>).map((item) => item.name);
    db.transaction(() => {
      db.prepare('DELETE FROM project_systems WHERE project_id = ?').run(projectId);
      const insert = db.prepare('INSERT INTO project_systems (id, project_id, name, sort_order) VALUES (?, ?, ?, ?)');
      names.forEach((name, i) => insert.run(randomUUID(), projectId, name, i));
    })();

    await writeAuditLog(db, request, { projectId, module: 'systems', action: 'update', entityType: '项目子系统', summary: `更新子系统：${names.length}项`, before, after: names });

    return NextResponse.json({ success: true, systems: names });
  } catch (error) {
    console.error('保存子系统失败:', error);
    await writeAuditLog(getDb(), request, { module: 'systems', action: 'update', entityType: '项目子系统', summary: `子系统保存失败：${error instanceof Error ? error.message : '未知错误'}`, result: 'failure' });
    return NextResponse.json({ error: '保存子系统失败' }, { status: 500 });
  }
}
