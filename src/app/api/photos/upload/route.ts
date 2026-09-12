import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const PHOTOS_ROOT = () => path.join(process.cwd(), 'data', 'photos');

/** 清理文件名中的非法字符，用于目录名与文件名 */
function safeName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\s]+/g, '')
    .replace(/\.\./g, '')
    .slice(0, 30) || '未命名';
}

// POST /api/photos/upload - 上传施工照片（按项目分类，自动命名：日期_施工内容_位置_时间戳）
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = (formData.get('projectId') as string) || 'default';
    const date = (formData.get('date') as string) || new Date().toISOString().split('T')[0];
    const workType = (formData.get('workType') as string) || '';
    const location = (formData.get('location') as string) || '';

    if (!file) {
      return NextResponse.json({ error: '请选择照片' }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: '单张照片不能超过 5MB，请压缩后重试' }, { status: 413 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'].includes(ext)) {
      return NextResponse.json({ error: '仅支持 JPG/PNG/GIF/WEBP 图片' }, { status: 400 });
    }

    const safeProject = safeName(projectId);
    const dir = path.join(PHOTOS_ROOT(), safeProject);
    fs.mkdirSync(dir, { recursive: true });

    const name = `${date}_${safeName(workType)}_${safeName(location)}_${Date.now()}${ext}`;
    const abs = path.join(dir, name);
    fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({
      success: true,
      name,
      url: `/api/photos/${encodeURIComponent(safeProject)}/${encodeURIComponent(name)}`,
    });
  } catch (error) {
    console.error('照片上传失败:', error);
    return NextResponse.json({ error: '照片上传失败' }, { status: 500 });
  }
}
