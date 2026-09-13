import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';
import { normalizeMatchText } from '@/lib/bom-matcher';

initDbWithSeed();

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  if (!projectId) return NextResponse.json({ error: '缺少项目' }, { status: 400 });
  const rows = getDb().prepare(`SELECT query_text, bom_item_id, confirm_count FROM bom_match_history
    WHERE project_id = ? ORDER BY confirm_count DESC, updated_at DESC LIMIT 500`).all(projectId);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const bomItemId = typeof body.bomItemId === 'string' ? body.bomItemId : '';
  const queryText = normalizeMatchText(typeof body.queryText === 'string' ? body.queryText : '').slice(0, 200);
  const db = getDb();
  const bom = db.prepare('SELECT 1 FROM bom_items WHERE id = ? AND project_id = ?').get(bomItemId, projectId);
  if (!projectId || !bomItemId || !queryText || !bom) return NextResponse.json({ error: '匹配记录无效' }, { status: 400 });
  db.prepare(`INSERT INTO bom_match_history (id, project_id, query_text, bom_item_id, confirm_count)
    VALUES (?, ?, ?, ?, 1) ON CONFLICT(project_id, query_text, bom_item_id)
    DO UPDATE SET confirm_count = confirm_count + 1, updated_at = datetime('now')`).run(randomUUID(), projectId, queryText, bomItemId);
  return NextResponse.json({ success: true });
}
