import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

/**
 * 文档存储工具：
 * - 云端模式：配置了 COZE_BUCKET_ENDPOINT_URL / COZE_BUCKET_NAME 时使用 S3 对象存储（Coze 云环境）
 * - 本地模式：未配置云端时，文件保存在 data/uploads/ 下，storage_uri 形如 local://<文件名>
 */

const LOCAL_PREFIX = 'local://';

/** S3 对象存储是否已配置 */
export function isS3Configured(): boolean {
  return !!(process.env.COZE_BUCKET_ENDPOINT_URL && process.env.COZE_BUCKET_NAME);
}

/** Coze AI 服务（知识索引/语义搜索/LLM）是否已配置 */
export function isCozeApiConfigured(): boolean {
  return !!(
    process.env.COZE_INTEGRATION_BASE_URL ||
    process.env.COZE_WORKLOAD_IDENTITY_API_KEY
  );
}

function getUploadsDir(): string {
  // 统一使用项目目录下的 data/uploads，保证生产环境文件持久化
  const dir = path.join(process.cwd(), 'data', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 保存文件到本地，返回 local:// 形式的 storage_uri */
export function saveLocalFile(fileName: string, buffer: Buffer): string {
  const safeName = fileName.replace(/[\\/:*?"<>|\r\n]/g, '_');
  const unique = `${Date.now()}_${cryptoRandomHex()}_${safeName}`;
  fs.writeFileSync(path.join(getUploadsDir(), unique), buffer);
  return `${LOCAL_PREFIX}${unique}`;
}

function cryptoRandomHex(): string {
  return crypto.randomBytes(4).toString('hex');
}

/** 根据 local:// storage_uri 解析本地文件绝对路径，不存在返回 null */
export function resolveLocalFile(storageUri: string | null | undefined): string | null {
  if (!storageUri || !storageUri.startsWith(LOCAL_PREFIX)) return null;
  const abs = path.join(getUploadsDir(), path.basename(storageUri.slice(LOCAL_PREFIX.length)));
  return fs.existsSync(abs) ? abs : null;
}

const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.tiff': 'image/tiff',
};

export function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

const MAX_TEXT_LENGTH = 200_000;

/** 本地模式下的文本提取：用于资料库检索和 AI 问答索引。 */
export async function extractLocalText(fileName: string, buffer: Buffer): Promise<string | null> {
  const ext = path.extname(fileName).toLowerCase();
  try {
    if (ext === '.txt' || ext === '.csv') {
      const text = buffer.toString('utf-8').trim();
      return text ? text.slice(0, MAX_TEXT_LENGTH) : null;
    }
    if (ext === '.xlsx' || ext === '.xls') {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        if (csv.trim()) parts.push(`【${sheetName}】\n${csv.trim()}`);
      }
      const text = parts.join('\n\n').trim();
      return text ? text.slice(0, MAX_TEXT_LENGTH) : null;
    }
    if (ext === '.docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();
      return text ? text.slice(0, MAX_TEXT_LENGTH) : null;
    }
  } catch (error) {
    console.error('本地文本提取失败:', error);
    return null;
  }
  return null;
}
