'use client';

import { useEffect, useRef, useState } from 'react';
import { DatabaseBackup, Download, HardDrive, RefreshCw, RotateCcw, Trash2, Upload } from 'lucide-react';
import { ManagePageHeader } from '@/components/manage-page-header';
import { toast } from 'sonner';

interface BackupInfo { name: string; size: number; createdAt: string; type: 'auto' | 'manual' | 'pre-restore' }
const typeNames = { auto: '自动备份', manual: '手动备份', 'pre-restore': '恢复前备份' } as const;
const formatSize = (size: number): string => size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const formatTime = (value: string): string => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/backups'); const data = await response.json() as { backups?: BackupInfo[]; error?: string };
      if (!response.ok) throw new Error(data.error || '加载失败'); setBackups(data.backups || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : '加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    setWorking('create');
    try { const response = await fetch('/api/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create' }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || '备份失败'); toast.success('完整数据备份已创建'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : '备份失败'); } finally { setWorking(''); }
  };
  const restore = async (name: string) => {
    if (!confirm(`确定恢复备份“${name}”吗？\n\n当前数据库、照片和文档将被替换。系统会先自动备份当前数据。`)) return;
    setWorking(name);
    try { const response = await fetch('/api/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', name }) }); const data = await response.json() as { error?: string; message?: string }; if (!response.ok) throw new Error(data.error || '恢复失败'); toast.success(data.message || '恢复成功'); window.setTimeout(() => window.location.reload(), 800); }
    catch (error) { toast.error(error instanceof Error ? error.message : '恢复失败'); setWorking(''); }
  };
  const uploadRestore = async (file: File) => {
    if (!confirm(`确定从“${file.name}”恢复吗？系统会校验文件并先备份当前数据。`)) { if (fileRef.current) fileRef.current.value = ''; return; }
    setWorking('upload');
    try { const form = new FormData(); form.append('file', file); const response = await fetch('/api/backups', { method: 'POST', body: form }); const data = await response.json() as { error?: string; message?: string }; if (!response.ok) throw new Error(data.error || '恢复失败'); toast.success(data.message || '恢复成功'); window.setTimeout(() => window.location.reload(), 800); }
    catch (error) { toast.error(error instanceof Error ? error.message : '恢复失败'); setWorking(''); if (fileRef.current) fileRef.current.value = ''; }
  };
  const remove = async (name: string) => {
    if (!confirm(`确定删除备份“${name}”吗？删除后无法下载或使用该文件恢复。`)) return;
    setWorking(name);
    try { const response = await fetch(`/api/backups?name=${encodeURIComponent(name)}`, { method: 'DELETE' }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || '删除失败'); toast.success('备份已删除'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : '删除失败'); } finally { setWorking(''); }
  };

  return <div className="min-h-screen bg-[#F5F6F8] pb-8">
    <ManagePageHeader title="数据备份" description="数据库、施工照片和上传文档" action={<button type="button" onClick={() => void load()} className="rounded-lg p-2 text-gray-500" aria-label="刷新"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>} />
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <section className="rounded-2xl bg-gradient-to-br from-[#1E5AA8] to-[#16457F] p-5 text-white shadow-sm"><div className="flex items-start gap-3"><DatabaseBackup className="mt-0.5 h-7 w-7"/><div><h2 className="font-semibold">完整数据保护</h2><p className="mt-1 text-xs leading-5 text-white/70">生产服务每天自动备份一次，保留最近30个自动备份。恢复前会再次保存当前数据，并校验文件和数据库完整性。</p></div></div><div className="mt-4 grid grid-cols-2 gap-3"><button disabled={!!working} onClick={() => void create()} className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-medium text-[#1E5AA8] disabled:opacity-60"><HardDrive className="h-4 w-4" />{working === 'create' ? '备份中…' : '立即备份'}</button><button disabled={!!working} onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl bg-white/15 py-2.5 text-sm font-medium disabled:opacity-60"><Upload className="h-4 w-4" />上传并恢复</button></div><input ref={fileRef} type="file" accept=".tar.gz,application/gzip" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadRestore(file); }} /></section>
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm"><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">备份记录</h2><p className="mt-0.5 text-xs text-gray-400">共 {backups.length} 个备份</p></div></div>
        {loading ? <div className="py-16 text-center text-sm text-gray-400">正在检查备份…</div> : backups.length === 0 ? <div className="py-16 text-center text-sm text-gray-400">暂无备份</div> : <div className="divide-y divide-gray-100">{backups.map((backup) => <div key={backup.name} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-start gap-3"><div className="rounded-xl bg-green-50 p-2.5 text-green-600"><DatabaseBackup className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-gray-900">{typeNames[backup.type]}</span><span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{formatSize(backup.size)}</span></div><p className="mt-1 text-xs text-gray-500">{formatTime(backup.createdAt)}</p><p className="mt-0.5 truncate font-mono text-[10px] text-gray-300">{backup.name}</p></div></div><div className="flex justify-end gap-1"><a href={`/api/backups?download=${encodeURIComponent(backup.name)}`} className="rounded-lg p-2 text-[#1E5AA8] hover:bg-blue-50" title="下载"><Download className="h-4 w-4" /></a><button disabled={!!working} onClick={() => void restore(backup.name)} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50 disabled:opacity-40" title="恢复"><RotateCcw className={`h-4 w-4 ${working === backup.name ? 'animate-spin' : ''}`} /></button><button disabled={!!working} onClick={() => void remove(backup.name)} className="rounded-lg p-2 text-red-400 hover:bg-red-50 disabled:opacity-40" title="删除"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}
      </section>
    </main>
  </div>;
}
