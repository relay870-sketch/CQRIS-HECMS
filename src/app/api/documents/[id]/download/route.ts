import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getDb, initDbWithSeed } from '@/lib/db';
import { getMimeType, resolveLocalFile } from '@/lib/storage';

initDbWithSeed();

export const runtime = 'nodejs';

// GET /api/documents/[id]/download - 本地模式下流式返回文件内容（预览/下载）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as {
      name?: string;
      storage_uri?: string | null;
    } | undefined;

    if (!doc) {
      return NextResponse.json({ error: '文档不存在' }, { status: 404 });
    }

    const localPath = resolveLocalFile(doc.storage_uri);
    if (!localPath) {
      return NextResponse.json({
        error: '本地文件不存在',
        detail: '该文档没有可用的本地文件（可能是云端模式或历史元数据记录）',
      }, { status: 404 });
    }

    const buffer = fs.readFileSync(localPath);
    const fileName = doc.name || 'document';

    // ?dl=1 时强制作为附件下载，否则内联预览
    const url = new URL(request.url);
    const asAttachment = url.searchParams.get('dl') === '1';
    const dispositionType = asAttachment ? 'attachment' : 'inline';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': getMimeType(fileName),
        'Content-Length': String(buffer.length),
        'Content-Disposition': `${dispositionType}; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Download document error:', error);
    return NextResponse.json({
      error: '文件读取失败',
      detail: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}
