import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

// GET /api/photos/[projectId]/[name] - 读取施工照片
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; name: string }> },
) {
  try {
    const { projectId, name } = await params;
    const dir = path.join(process.cwd(), 'data', 'photos', path.basename(projectId));
    const abs = path.join(dir, path.basename(name));

    if (!fs.existsSync(abs)) {
      return NextResponse.json({ error: '照片不存在' }, { status: 404 });
    }

    const buf = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME_MAP[ext] || 'image/jpeg';

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('读取照片失败:', error);
    return NextResponse.json({ error: '读取照片失败' }, { status: 500 });
  }
}

// DELETE /api/photos/[projectId]/[name] - 删除未提交或已解除关联的施工照片
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; name: string }> },
) {
  try {
    const { projectId, name } = await params;
    const abs = path.join(process.cwd(), 'data', 'photos', path.basename(projectId), path.basename(name));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除照片失败:', error);
    return NextResponse.json({ error: '删除照片失败' }, { status: 500 });
  }
}
