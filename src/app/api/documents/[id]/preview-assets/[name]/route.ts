import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getMimeType } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  const { id, name } = await params;
  const safeId = path.basename(id);
  const safeName = path.basename(name);
  if (safeId !== id || safeName !== name) {
    return NextResponse.json({ error: '无效的图片地址' }, { status: 400 });
  }

  const imagePath = path.join(process.cwd(), 'data', 'docx-preview', safeId, safeName);
  if (!fs.existsSync(imagePath)) {
    return NextResponse.json({ error: '预览图片不存在' }, { status: 404 });
  }

  return new NextResponse(fs.readFileSync(imagePath), {
    headers: {
      'Content-Type': getMimeType(safeName),
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
