import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { resolveLocalFile } from '@/lib/storage';
import { calculateProjectProgress, type ProgressItem } from '@/lib/project-progress';
import { writeAuditLog } from '@/lib/audit';

// Initialize database with seed data
initDbWithSeed();

interface ProjectRow { id: string; progress: number; [key: string]: unknown }

function withAutomaticProgress(db: Database.Database, project: ProjectRow) {
  const items = db.prepare('SELECT total_qty, completed_qty, unit_price FROM bom_items WHERE project_id = ?').all(project.id) as ProgressItem[];
  return { ...project, ...calculateProjectProgress(items, project.progress) };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  const db = getDb();

  if (id) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }
    return NextResponse.json(withAutomaticProgress(db, project));
  }

  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];
  return NextResponse.json(projects.map((project) => withAutomaticProgress(db, project)));
}

// Create new project
export async function POST(request: Request) {
  const db = getDb();
  const body = await request.json();
  
  const { name, section, start_date, end_date, manager } = body;
  
  if (!name || !section) {
    return NextResponse.json({ error: '项目名称和标段不能为空' }, { status: 400 });
  }

  const id = 'p' + Date.now();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  
  db.prepare(`
    INSERT INTO projects (id, name, section, status, start_date, end_date, manager, progress, created_at, updated_at)
    VALUES (?, ?, ?, 'in_progress', ?, ?, ?, 0, ?, ?)
  `).run(id, name, section, start_date || null, end_date || null, manager || '', now, now);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  await writeAuditLog(db, request, { projectId: id, module: 'projects', action: 'create', entityType: '项目', entityId: id, summary: `新增项目：${name}`, after: project });
  return NextResponse.json(project, { status: 201 });
}

// Update project
export async function PUT(request: Request) {
  const db = getDb();
  const body = await request.json();
  
  const { id, name, section, status, start_date, end_date, manager, progress } = body;
  
  if (!id) {
    return NextResponse.json({ error: '缺少项目ID' }, { status: 400 });
  }

  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  
  db.prepare(`
    UPDATE projects SET 
      name = COALESCE(?, name),
      section = COALESCE(?, section),
      status = COALESCE(?, status),
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      manager = COALESCE(?, manager),
      progress = COALESCE(?, progress),
      updated_at = ?
    WHERE id = ?
  `).run(
    name || null,
    section || null,
    status || null,
    start_date || null,
    end_date || null,
    manager !== undefined ? manager : null,
    progress !== undefined ? progress : null,
    now,
    id
  );

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  await writeAuditLog(db, request, { projectId: id, module: 'projects', action: 'update', entityType: '项目', entityId: id, summary: `修改项目：${name || (existing as { name?: string }).name || id}`, before: existing, after: project });
  return NextResponse.json(project);
}

// Delete project
export async function DELETE(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  if (!id) {
    return NextResponse.json({ error: '缺少项目ID' }, { status: 400 });
  }

  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  }

  // Delete related data
  const localDocuments = db.prepare('SELECT storage_uri FROM documents WHERE project_id = ?').all(id) as Array<{ storage_uri: string | null }>;
  for (const document of localDocuments) {
    const localPath = resolveLocalFile(document.storage_uri);
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
  }
  await writeAuditLog(db, request, { projectId: id, module: 'projects', action: 'delete', entityType: '项目', entityId: id, summary: `删除项目：${(existing as { name?: string }).name || id}`, before: existing });
  db.transaction(() => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  })();
  const photoDir = path.join(process.cwd(), 'data', 'photos', path.basename(id));
  if (fs.existsSync(photoDir)) fs.rmSync(photoDir, { recursive: true, force: true });

  return NextResponse.json({ success: true });
}
