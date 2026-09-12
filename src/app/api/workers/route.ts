import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  
  const db = getDb();

  let workers;
  if (projectId) {
    workers = db.prepare('SELECT * FROM workers WHERE project_id = ? ORDER BY team, name').all(projectId);
  } else {
    workers = db.prepare('SELECT * FROM workers ORDER BY project_id, team, name').all();
  }

  return NextResponse.json(workers);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { project_id, name, role, team, phone, join_date } = body;

  if (!project_id || !name) {
    return NextResponse.json({ error: '项目ID和姓名为必填项' }, { status: 400 });
  }

  const db = getDb();
  const id = `w${Date.now()}`;
  const stmt = db.prepare(`
    INSERT INTO workers (id, project_id, name, role, team, phone, join_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, project_id, name, role || '', team || '', phone || '', join_date || '');
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(id);
  await writeAuditLog(db, request, { projectId: project_id, module: 'workers', action: 'create', entityType: '人员', entityId: id, summary: `新增人员：${name}`, after: worker });

  return NextResponse.json(worker, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, project_id, name, role, team, phone, join_date } = body;

  if (!id) {
    return NextResponse.json({ error: '人员ID为必填项' }, { status: 400 });
  }

  const db = getDb();
  const before = db.prepare('SELECT * FROM workers WHERE id = ?').get(id);
  const stmt = db.prepare(`
    UPDATE workers 
    SET project_id = ?, name = ?, role = ?, team = ?, phone = ?, join_date = ?
    WHERE id = ?
  `);

  stmt.run(project_id, name, role || '', team || '', phone || '', join_date || '', id);
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(id);

  if (!worker) {
    return NextResponse.json({ error: '人员不存在' }, { status: 404 });
  }

  await writeAuditLog(db, request, { projectId: project_id, module: 'workers', action: 'update', entityType: '人员', entityId: id, summary: `修改人员：${name}`, before, after: worker });

  return NextResponse.json(worker);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: '人员ID为必填项' }, { status: 400 });
  }

  const db = getDb();
  const before = db.prepare('SELECT * FROM workers WHERE id = ?').get(id) as { project_id?: string; name?: string } | undefined;
  db.prepare('DELETE FROM workers WHERE id = ?').run(id);

  await writeAuditLog(db, request, { projectId: before?.project_id, module: 'workers', action: 'delete', entityType: '人员', entityId: id, summary: `删除人员：${before?.name || id}`, before });

  return NextResponse.json({ success: true });
}
