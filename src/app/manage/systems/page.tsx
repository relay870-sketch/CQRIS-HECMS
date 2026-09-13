'use client';

import { useState, useEffect } from 'react';
import { useProject } from '@/components/project-provider';
import { Layers, Plus, Trash2, Check } from 'lucide-react';
import { ManagePageHeader } from '@/components/manage-page-header';

const QUICK_SYSTEMS = [
  '收费系统', '监控系统', '通信系统', '供配电系统',
  '隧道监控', '隧道通风', '隧道照明', '其他',
];

export default function ManageSystemsPage() {
  const { currentProject, isReady } = useProject();
  const [systems, setSystems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isReady || currentProject.name === '加载中...') return;
    fetchSystems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject.id, isReady]);

  const fetchSystems = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/systems?projectId=${currentProject.id}`);
      const data = await res.json();
      setSystems(Array.isArray(data) ? data.map((s: { name: string }) => s.name) : []);
    } catch (error) {
      console.error('加载子系统失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const addSystem = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (systems.includes(trimmed)) return;
    setSystems((prev) => [...prev, trimmed]);
    setNewName('');
  };

  const removeSystem = (name: string) => {
    if (systems.length <= 1) {
      alert('至少保留一个子系统');
      return;
    }
    setSystems((prev) => prev.filter((s) => s !== name));
  };

  const save = async () => {
    if (systems.length === 0) {
      alert('请至少保留一个子系统');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/systems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProject.id, names: systems }),
      });
      const data = await res.json();
      if (data.success) {
        alert('子系统已保存');
        fetchSystems();
      } else {
        alert(data.error || '保存失败');
      }
    } catch (error) {
      console.error('保存子系统失败:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F6F8] pb-8">
      <ManagePageHeader title="子系统管理" description={`${currentProject.name} · 每个子系统对应独立的工程量清单`} />

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        {/* 当前系统 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="flex items-center gap-1 text-sm font-medium text-[#1A1A2E] mb-2">
            <Layers className="w-4 h-4" />当前子系统
          </label>
          {loading ? (
            <div className="text-center py-6 text-gray-400">加载中...</div>
          ) : systems.length === 0 ? (
            <div className="text-center py-6 text-gray-400">暂无子系统</div>
          ) : (
            <div className="space-y-2">
              {systems.map((name) => (
                <div key={name} className="flex items-center gap-2 p-3 bg-[#F5F6F8] rounded-xl">
                  <span className="w-1.5 h-1.5 bg-[#1E5AA8] rounded-full shrink-0" />
                  <span className="flex-1 text-sm text-[#1A1A2E]">{name}</span>
                  <button
                    type="button"
                    onClick={() => removeSystem(name)}
                    className="p-1.5 text-red-400 hover:text-red-500 rounded-lg"
                    aria-label="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 添加 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-sm font-medium text-[#1A1A2E] mb-2">添加子系统</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSystem(newName)}
              placeholder="输入系统名称"
              className="flex-1 px-4 py-3 bg-[#F5F6F8] rounded-lg text-sm text-[#1A1A2E] placeholder:text-gray-300"
            />
            <button
              type="button"
              onClick={() => addSystem(newName)}
              disabled={!newName.trim()}
              className="px-4 py-3 bg-[#1E5AA8] text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> 添加
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_SYSTEMS.filter((s) => !systems.includes(s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addSystem(s)}
                className="px-3 py-1.5 bg-[#F5F6F8] text-gray-600 rounded-lg text-xs hover:bg-[#E8F0FE] hover:text-[#1E5AA8] transition-colors"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>

        {/* 保存 */}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full py-3.5 bg-[#16A34A] text-white rounded-xl font-medium text-base disabled:opacity-50 flex items-center justify-center gap-1"
        >
          <Check className="w-4 h-4" /> {saving ? '保存中...' : '保存子系统设置'}
        </button>

        <p className="text-xs text-gray-400 px-1">
          说明：在工程量清单管理中可以为每个清单子目指定所属系统；报工时选择所属系统后，施工内容只从该系统下的清单中联想。
        </p>
      </div>
    </div>
  );
}
