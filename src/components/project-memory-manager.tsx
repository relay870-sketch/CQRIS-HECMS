'use client';

import { useEffect, useState } from 'react';
import { Brain, Check, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useProject } from '@/components/project-provider';

type Category = 'facts' | 'preferences' | 'open_issues' | 'decisions';
type Memory = Record<Category, string[]>;

const emptyMemory = (): Memory => ({ facts: [], preferences: [], open_issues: [], decisions: [] });
const sections: Array<{ key: Category; title: string; description: string; tone: string }> = [
  { key: 'facts', title: '重要事实', description: '项目固定信息、人员关系和现场条件', tone: 'bg-blue-50 text-blue-700' },
  { key: 'preferences', title: '施工偏好', description: '统计口径、表达习惯和现场做法', tone: 'bg-violet-50 text-violet-700' },
  { key: 'open_issues', title: '遗留问题', description: '尚未解决、需要继续跟进的事项', tone: 'bg-amber-50 text-amber-700' },
  { key: 'decisions', title: '关键结论', description: '已确定的方案、决定和处理结果', tone: 'bg-emerald-50 text-emerald-700' },
];

export function ProjectMemoryManager({ enabled }: { enabled: boolean }) {
  const { currentProject, isReady } = useProject();
  const [memory, setMemory] = useState<Memory>(emptyMemory());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<Category, string>>({ facts: '', preferences: '', open_issues: '', decisions: '' });
  const [editing, setEditing] = useState<{ category: Category; index: number; value: string } | null>(null);

  const load = async () => {
    if (!isReady || !currentProject.id) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/project-memory?projectId=${encodeURIComponent(currentProject.id)}`, { cache: 'no-store' });
      const value = await response.json() as { memory?: Memory; error?: string };
      if (!response.ok || !value.memory) throw new Error(value.error || '读取长期记忆失败');
      setMemory(value.memory);
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '读取长期记忆失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [currentProject.id, isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (next: Memory, action: 'add' | 'edit' | 'delete', category: Category, message: string) => {
    setSaving(true);
    try {
      const response = await fetch('/api/project-memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProject.id, memory: next, action, category }),
      });
      const value = await response.json() as { memory?: Memory; error?: string };
      if (!response.ok || !value.memory) throw new Error(value.error || '保存长期记忆失败');
      setMemory(value.memory);
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存长期记忆失败');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addItem = async (category: Category) => {
    const value = drafts[category].trim();
    if (!value) return;
    if (memory[category].length >= 12) return toast.error('每类最多保存 12 条记忆');
    const next = { ...memory, [category]: [...memory[category], value] };
    if (await persist(next, 'add', category, '长期记忆已添加')) setDrafts({ ...drafts, [category]: '' });
  };

  const saveEdit = async () => {
    if (!editing || !editing.value.trim()) return;
    const items = [...memory[editing.category]];
    items[editing.index] = editing.value.trim();
    const next = { ...memory, [editing.category]: items };
    if (await persist(next, 'edit', editing.category, '长期记忆已修改')) setEditing(null);
  };

  const removeItem = async (category: Category, index: number) => {
    if (!confirm('确定删除这条长期记忆吗？')) return;
    const next = { ...memory, [category]: memory[category].filter((_, itemIndex) => itemIndex !== index) };
    await persist(next, 'delete', category, '长期记忆已删除');
  };

  const clearAll = async () => {
    if (!confirm(`确定清空“${currentProject.name}”的全部长期记忆吗？\n此操作不会删除 AI 聊天记录。`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/project-memory?projectId=${encodeURIComponent(currentProject.id)}`, { method: 'DELETE' });
      const value = await response.json() as { error?: string };
      if (!response.ok) throw new Error(value.error || '清空失败');
      setMemory(emptyMemory());
      setEditing(null);
      toast.success('当前项目长期记忆已清空');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '清空失败');
    } finally {
      setSaving(false);
    }
  };

  const count = Object.values(memory).reduce((sum, items) => sum + items.length, 0);
  return <section className="rounded-2xl bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-[#E8F0FE] p-2.5 text-[#1E5AA8]"><Brain className="h-5 w-5"/></div><div><h2 className="font-semibold">项目长期记忆</h2><p className="mt-1 text-xs leading-5 text-gray-400">当前项目：{currentProject.name} · 共 {count} 条。聊天历史与这里的长期记忆相互独立。</p></div></div>
      <div className="flex gap-2"><button type="button" onClick={() => void load()} disabled={loading || saving} className="rounded-lg border px-3 py-2 text-xs text-gray-600 disabled:opacity-40"><RefreshCw className={`inline h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}/> 刷新</button><button type="button" onClick={() => void clearAll()} disabled={!count || saving} className="rounded-lg border border-red-100 px-3 py-2 text-xs text-red-500 disabled:opacity-40">清空全部</button></div>
    </div>
    {!enabled && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">长期记忆当前已暂停提供给 AI，但仍可在这里查看和维护。</div>}
    {loading ? <div className="py-12 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin"/></div> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{sections.map((section) => <div key={section.key} className="rounded-xl border border-gray-100 p-3"><div className="flex items-center justify-between gap-2"><div><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${section.tone}`}>{section.title}</span><p className="mt-1 text-xs text-gray-400">{section.description}</p></div><span className="text-xs text-gray-300">{memory[section.key].length}/12</span></div>
      <div className="mt-3 space-y-2">{memory[section.key].length === 0 && <p className="rounded-lg bg-gray-50 px-3 py-3 text-center text-xs text-gray-400">暂无内容</p>}{memory[section.key].map((item, index) => <div key={`${section.key}-${index}`} className="group flex items-start gap-2 rounded-lg bg-gray-50 p-2.5">{editing?.category === section.key && editing.index === index ? <><textarea autoFocus value={editing.value} onChange={(event) => setEditing({ ...editing, value: event.target.value })} maxLength={500} className="min-h-16 flex-1 resize-y rounded-md border bg-white p-2 text-sm"/><button type="button" onClick={() => void saveEdit()} disabled={saving || !editing.value.trim()} className="p-1 text-green-600"><Check className="h-4 w-4"/></button><button type="button" onClick={() => setEditing(null)} className="p-1 text-gray-400"><X className="h-4 w-4"/></button></> : <><p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-5 text-gray-700">{item}</p><button type="button" onClick={() => setEditing({ category: section.key, index, value: item })} className="p-1 text-gray-400 hover:text-[#1E5AA8]" aria-label="编辑"><Pencil className="h-3.5 w-3.5"/></button><button type="button" onClick={() => void removeItem(section.key, index)} className="p-1 text-gray-400 hover:text-red-500" aria-label="删除"><Trash2 className="h-3.5 w-3.5"/></button></>}</div>)}</div>
      <div className="mt-2 flex gap-2"><input value={drafts[section.key]} onChange={(event) => setDrafts({ ...drafts, [section.key]: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addItem(section.key); } }} disabled={saving || memory[section.key].length >= 12} maxLength={500} placeholder={`添加${section.title}`} className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-sm"/><button type="button" onClick={() => void addItem(section.key)} disabled={saving || !drafts[section.key].trim() || memory[section.key].length >= 12} className="flex h-9 items-center gap-1 rounded-lg bg-[#E8F0FE] px-3 text-xs text-[#1E5AA8] disabled:opacity-40"><Plus className="h-3.5 w-3.5"/>添加</button></div>
    </div>)}</div>}
  </section>;
}
