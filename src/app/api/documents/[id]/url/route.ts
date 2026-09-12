import { NextRequest, NextResponse } from 'next/server';
import { S3Storage, Config } from 'coze-coding-dev-sdk';
import { getDb, initDbWithSeed } from '@/lib/db';
import { isS3Configured, resolveLocalFile } from '@/lib/storage';

initDbWithSeed();

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as {
      name?: string;
      type?: string;
      storage_uri?: string | null;
    } | undefined;

    if (!doc) {
      return NextResponse.json({ error: '文档不存在' }, { status: 404 });
    }

    if (!doc.storage_uri) {
      return NextResponse.json({
        error: '文档未上传到存储',
        detail: '该文档记录存在但文件未上传，请联系管理员上传文件',
      }, { status: 404 });
    }

    // 本地模式：文件保存在本地磁盘，返回本地下载路由
    if (resolveLocalFile(doc.storage_uri)) {
      return NextResponse.json({
        success: true,
        url: `/api/documents/${id}/download`,
        fileName: doc.name,
        type: doc.type,
        local: true,
      });
    }

    if (!isS3Configured()) {
      return NextResponse.json({
        error: '存储未配置',
        detail: '未配置 COZE_BUCKET_ENDPOINT_URL 且本地文件不存在，无法生成下载链接',
      }, { status: 500 });
    }

    // 云端模式：生成 S3 预签名 URL 供查看/下载
    const config = new Config();
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

    const url = await storage.generatePresignedUrl({
      key: doc.storage_uri,
      expireTime: 3600,
    });

    return NextResponse.json({
      success: true,
      url,
      fileName: doc.name,
      type: doc.type,
    });
  } catch (error) {
    console.error('Get document URL error:', error);
    return NextResponse.json({
      error: '获取文档链接失败',
      detail: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}
