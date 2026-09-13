import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { closeDb, getDb } from '@/lib/db';

const execFileAsync = promisify(execFile);
const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = process.env.PROJECT_BACKUP_DIR
  ? path.resolve(process.env.PROJECT_BACKUP_DIR)
  : path.join(process.cwd(), 'backups');
const BACKUP_PATTERN = /^construction_(auto|manual|pre-restore)_\d{8}_\d{6}\.tar\.gz$/;

export interface BackupInfo { name: string; size: number; createdAt: string; type: 'auto' | 'manual' | 'pre-restore' }
interface Manifest { version: 1; createdAt: string; type: BackupInfo['type']; files: Record<string, string> }

function ensureBackupDir(): void { fs.mkdirSync(BACKUP_DIR, { recursive: true }); }
function stamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}_${value.hour}${value.minute}${value.second}`;
}
function hashFile(file: string): string { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function walkFiles(root: string, relative = ''): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(relative, entry.name);
    if (entry.name === '.DS_Store') return [];
    return entry.isDirectory() ? walkFiles(root, next) : [next];
  });
}
function copyDataAssets(targetData: string): void {
  fs.mkdirSync(targetData, { recursive: true });
  for (const name of ['photos', 'uploads', 'docx-preview']) {
    const source = path.join(DATA_DIR, name);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(targetData, name), { recursive: true });
  }
}

export function listBackups(): BackupInfo[] {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR).filter((name) => BACKUP_PATTERN.test(name)).map((name) => {
    const stat = fs.statSync(path.join(BACKUP_DIR, name));
    const type = name.slice('construction_'.length).split('_')[0] as BackupInfo['type'];
    return { name, size: stat.size, createdAt: stat.mtime.toISOString(), type };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function resolveBackup(name: string): string {
  if (!BACKUP_PATTERN.test(name)) throw new Error('备份文件名无效');
  return path.join(BACKUP_DIR, name);
}

export async function createBackup(type: BackupInfo['type'] = 'manual'): Promise<BackupInfo> {
  ensureBackupDir();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cqris-backup-'));
  try {
    const stagedData = path.join(work, 'data');
    copyDataAssets(stagedData);
    await getDb().backup(path.join(stagedData, 'construction.db'));
    const files = Object.fromEntries(walkFiles(stagedData).map((relative) => [`data/${relative.split(path.sep).join('/')}`, hashFile(path.join(stagedData, relative))]));
    const manifest: Manifest = { version: 1, createdAt: new Date().toISOString(), type, files };
    fs.writeFileSync(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const name = `construction_${type}_${stamp()}.tar.gz`;
    await execFileAsync('tar', ['-czf', path.join(BACKUP_DIR, name), '-C', work, 'manifest.json', 'data']);
    pruneBackups();
    return listBackups().find((item) => item.name === name)!;
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

export async function ensureDailyBackup(): Promise<void> {
  const today = stamp().slice(0, 8);
  if (!listBackups().some((item) => item.type === 'auto' && item.name.includes(`_${today}_`))) await createBackup('auto');
}

function pruneBackups(): void {
  const autos = listBackups().filter((item) => item.type === 'auto');
  for (const item of autos.slice(30)) fs.unlinkSync(resolveBackup(item.name));
}

async function extractAndValidate(archive: string): Promise<{ root: string; manifest: Manifest }> {
  const { stdout } = await execFileAsync('tar', ['-tzf', archive]);
  const entries = stdout.split('\n').filter(Boolean);
  if (entries.length === 0 || entries.some((entry) => entry.startsWith('/') || entry.includes('..') || !(entry === 'manifest.json' || entry === 'data' || entry.startsWith('data/')))) throw new Error('备份包包含不安全的路径');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cqris-restore-'));
  await execFileAsync('tar', ['-xzf', archive, '-C', root]);
  for (const relative of walkFiles(root)) {
    const file = path.join(root, relative);
    if (fs.lstatSync(file).isSymbolicLink() || !fs.realpathSync(file).startsWith(`${fs.realpathSync(root)}${path.sep}`)) throw new Error('备份包包含不安全的文件链接');
  }
  const manifestPath = path.join(root, 'manifest.json');
  const dbPath = path.join(root, 'data', 'construction.db');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(dbPath)) throw new Error('备份包缺少数据库或清单');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
  if (manifest.version !== 1 || !manifest.files) throw new Error('不支持的备份版本');
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file) || hashFile(file) !== expected) throw new Error(`文件校验失败：${relative}`);
  }
  const check = new Database(dbPath, { readonly: true });
  try {
    const integrity = check.pragma('integrity_check', { simple: true });
    const tables = check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    if (integrity !== 'ok' || !tables.some((table) => table.name === 'projects') || !tables.some((table) => table.name === 'reports')) throw new Error('数据库完整性检查失败');
  } finally { check.close(); }
  return { root, manifest };
}

export async function restoreBackup(archive: string): Promise<void> {
  const validated = await extractAndValidate(archive);
  await createBackup('pre-restore');
  const rollback = `${DATA_DIR}.restore-rollback`;
  const sessionSecret = path.join(DATA_DIR, '.session-secret');
  const preservedSecret = fs.existsSync(sessionSecret) ? fs.readFileSync(sessionSecret) : null;
  try {
    closeDb();
    fs.rmSync(rollback, { recursive: true, force: true });
    if (fs.existsSync(DATA_DIR)) fs.renameSync(DATA_DIR, rollback);
    fs.renameSync(path.join(validated.root, 'data'), DATA_DIR);
    if (preservedSecret) fs.writeFileSync(path.join(DATA_DIR, '.session-secret'), preservedSecret, { mode: 0o600 });
    getDb();
    fs.rmSync(rollback, { recursive: true, force: true });
  } catch (error) {
    closeDb();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    if (fs.existsSync(rollback)) fs.renameSync(rollback, DATA_DIR);
    getDb();
    throw error;
  } finally { fs.rmSync(validated.root, { recursive: true, force: true }); }
}

export function deleteBackup(name: string): void { fs.unlinkSync(resolveBackup(name)); }
