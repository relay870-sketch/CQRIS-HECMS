import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';

initDbWithSeed();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const type = searchParams.get('type');
  
  const db = getDb();

  let query = 'SELECT * FROM documents WHERE 1=1';
  const params: string[] = [];

  if (projectId) {
    query += ' AND project_id = ?';
    params.push(projectId);
  }
  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  query += ' ORDER BY upload_date DESC';

  const documents = db.prepare(query).all(...params);
  return NextResponse.json(documents);
}
