import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { getDb, initDbWithSeed } from '@/lib/db';
import { isS3Configured, resolveLocalFile } from '@/lib/storage';

initDbWithSeed();

export const runtime = 'nodejs';

const MAX_ROWS = 500;
const MAX_COLS = 50;
const MAX_CELL_LENGTH = 200;

const DOCX_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'image/tiff': '.tiff',
};

function getDocxPreviewImageDir(documentId: string): string {
  const dir = path.join(process.cwd(), 'data', 'docx-preview', documentId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Word 文档预览排版样式（mammoth 只输出语义标签，需要注入 CSS） */
const DOCX_PREVIEW_STYLES = `
body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.8;color:#1A1A2E;margin:0;padding:16px;word-break:break-word;background:#fff}
p{margin:0 0 12px}
h1{font-size:22px;font-weight:700;margin:20px 0 12px;line-height:1.4}
h2{font-size:19px;font-weight:700;margin:18px 0 10px;line-height:1.4}
h3{font-size:17px;font-weight:600;margin:16px 0 8px;line-height:1.4}
h4,h5,h6{font-size:15px;font-weight:600;margin:14px 0 8px}
ul,ol{margin:0 0 12px;padding-left:24px}
li{margin-bottom:4px}
table{border-collapse:collapse;width:100%;margin:0 0 12px;font-size:13px}
td,th{border:1px solid #E5E7EB;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#F3F4F6;font-weight:600}
img{max-width:100%;height:auto;display:block;margin:8px 0}
strong,b{font-weight:600}
em,i{font-style:italic}
blockquote{border-left:3px solid #D1D5DB;margin:0 0 12px;padding-left:12px;color:#6B7280}
a{color:#1E5AA8}
hr{border:none;border-top:1px solid #E5E7EB;margin:16px 0}
sup,sub{font-size:11px}
`;

interface DocRow {
  id: string;
  name: string;
  type: string;
  storage_uri: string | null;
}

// GET /api/documents/[id]/preview - 返回文档预览数据（文本/表格/二进制链接）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const doc = db.prepare('SELECT id, name, type, storage_uri FROM documents WHERE id = ?').get(id) as DocRow | undefined;

    if (!doc) {
      return NextResponse.json({ error: '文档不存在' }, { status: 404 });
    }

    const fileName = doc.name || 'document';
    const ext = path.extname(fileName).toLowerCase();

    // ---------- 云端模式（非本地存储）：生成 S3 预签名链接，前端用 iframe/img 展示或直接下载 ----------
    if (!doc.storage_uri || !doc.storage_uri.startsWith('local://')) {
      if (!doc.storage_uri || !isS3Configured()) {
        return NextResponse.json({
          format: 'unsupported',
          fileName,
          message: '该文档没有可用的文件内容（历史元数据记录或存储未配置）',
        });
      }
      const { S3Storage, Config } = await import('coze-coding-dev-sdk');
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
      const isPdfOrImage = ext === '.pdf' || ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext);
      return NextResponse.json({
        format: isPdfOrImage ? 'binary' : 'unsupported',
        fileName,
        url,
        downloadUrl: url,
        contentType: ext === '.pdf' ? 'pdf' : 'image',
        message: isPdfOrImage ? undefined : '该文件格式暂不支持在线预览，请下载后查看',
      });
    }

    const localPath = resolveLocalFile(doc.storage_uri);
    if (!localPath) {
      return NextResponse.json({
        format: 'unsupported',
        fileName,
        message: '本地文件不存在或已被删除',
      });
    }

    const buffer = fs.readFileSync(localPath);
    const downloadUrl = `/api/documents/${id}/download?dl=1`;

    // PDF / 图片：返回二进制链接，前端 iframe / img 预览
    if (ext === '.pdf' || ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      return NextResponse.json({
        format: 'binary',
        fileName,
        url: `/api/documents/${id}/download`,
        downloadUrl,
        contentType: ext === '.pdf' ? 'pdf' : 'image',
      });
    }

    // 文本类：返回纯文本内容
    if (ext === '.txt' || ext === '.csv') {
      const content = buffer.toString('utf-8');
      return NextResponse.json({
        format: 'text',
        fileName,
        content: content.slice(0, 200_000),
        downloadUrl,
      });
    }

    // Word：使用 mammoth 转换为 HTML（含图片内嵌），前端 iframe 隔离渲染
    if (ext === '.docx') {
      try {
        const mammoth = await import('mammoth');
        const imageDir = getDocxPreviewImageDir(id);
        let imageIndex = 0;
        const result = await mammoth.convertToHtml({
          buffer,
          convertImage: async (image) => {
            try {
              const imgBuffer = await image.read();
              imageIndex += 1;
              const extension = DOCX_IMAGE_EXTENSIONS[image.contentType] || '.bin';
              const imageName = `image-${imageIndex}${extension}`;
              fs.writeFileSync(path.join(imageDir, imageName), imgBuffer);
              return {
                src: `/api/documents/${id}/preview-assets/${imageName}`,
              };
            } catch {
              return { src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' };
            }
          },
        });
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>${DOCX_PREVIEW_STYLES}</style></head><body>${result.value}</body></html>`;
        const textResult = await mammoth.extractRawText({ buffer });
        const indexedContent = textResult.value.trim().slice(0, 200_000);
        if (indexedContent) {
          db.prepare('UPDATE documents SET content = ? WHERE id = ?').run(indexedContent, id);
        }
        return NextResponse.json({
          format: 'docx-html',
          fileName,
          html,
          downloadUrl,
        });
      } catch (error) {
        console.error('Word 文档 HTML 解析失败:', error);
      }

      // 兜底：提取纯文本
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        const content = (result.value || '').trim();
        if (content) {
          return NextResponse.json({
            format: 'text',
            fileName,
            content: content.slice(0, 200_000),
            downloadUrl,
            source: 'docx',
          });
        }
      } catch (error) {
        console.error('Word 文档文本解析失败:', error);
      }
      return NextResponse.json({
        format: 'unsupported',
        fileName,
        message: 'Word 文档解析失败，请下载后查看',
        downloadUrl,
      });
    }

    // Excel：服务端解析为表格数据
    if (ext === '.xlsx' || ext === '.xls') {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheets = wb.SheetNames.slice(0, 10).map((sheetName) => {
        const ws = wb.Sheets[sheetName];
        const rows: string[][] = [];
        const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
        if (!range) return { name: sheetName, rows };
        const maxRow = Math.min(range.e.r, MAX_ROWS - 1);
        const maxCol = Math.min(range.e.c, MAX_COLS - 1);
        for (let r = range.s.r; r <= maxRow; r++) {
          const row: string[] = [];
          for (let c = range.s.c; c <= maxCol; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            let value = '';
            if (cell) {
              if (cell.w !== undefined) value = String(cell.w);
              else if (cell.v !== undefined) value = String(cell.v);
              if (cell.t === 's' && typeof cell.v === 'string') value = cell.v;
            }
            row.push(value.slice(0, MAX_CELL_LENGTH));
          }
          rows.push(row);
        }
        return { name: sheetName, rows };
      });
      return NextResponse.json({
        format: 'xlsx',
        fileName,
        sheets,
        downloadUrl,
      });
    }

    // Word / PPT 等其他格式：暂不支持在线预览，引导下载
    return NextResponse.json({
      format: 'unsupported',
      fileName,
      message: '该文件格式暂不支持在线预览，请下载后查看',
      downloadUrl,
    });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json({
      error: '预览数据获取失败',
      detail: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}
