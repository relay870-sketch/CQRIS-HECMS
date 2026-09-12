import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getDb, initDbWithSeed } from '@/lib/db';
import { resolveLocalFile } from '@/lib/storage';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: '缺少文档 ID' }, { status: 400 });
    }

    const db = getDb();

    // Get document info first
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as {
      storage_uri?: string | null;
      project_id?: string;
      name?: string;
    } | undefined;
    if (!doc) {
      return NextResponse.json({ error: '文档不存在' }, { status: 404 });
    }

    // Delete from database
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);

    // 本地模式下同步清理磁盘文件（失败不影响删除结果）
    try {
      const localPath = resolveLocalFile(doc.storage_uri);
      if (localPath) {
        fs.unlinkSync(localPath);
      }
    } catch (error) {
      console.error('清理本地文件失败:', error);
    }

    await writeAuditLog(db, request, { projectId: doc.project_id, module: 'documents', action: 'delete', entityType: '资料文档', entityId: id, summary: `删除资料：${doc.name || id}`, before: { ...doc, content: undefined } });

    return NextResponse.json({ success: true, message: '文档已删除' });
  } catch (error) {
    console.error('Delete document error:', error);
    return NextResponse.json({
      error: '删除失败',
      detail: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}
