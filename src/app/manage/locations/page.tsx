'use client';

import { useState, useEffect } from 'react';
import { useProject } from '@/components/project-provider';
import { MapPin, Plus, Trash2, Upload, X } from 'lucide-react';

interface LocationItem {
  id: string | null;
  name: string;
}

export default function ManageLocationsPage() {
  const { currentProject, isReady } = useProject();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [singleName, setSingleName] = useState('');
  const [batchText, setBatchText] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/locations?projectId=${currentProject.id}`);
      const data = await res.json();
      setLocations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('加载桩号失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isReady && currentProject.name !== '加载中...') {
      fetchLocations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject.id, isReady]);

  const addSingle = async () => {
    const name = singleName.trim();
    if (!name) return;
    await submitNames([name]);
    setSingleName('');
  };

  const importBatch = async () => {
    const names = batchText
      .split(/[\n,，;；]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) {
      alert('请输入要导入的桩号，每行一个');
      return;
    }
    await submitNames(names);
    setBatchText('');
  };

  const submitNames = async (names: string[]) => {
    setBusy(true);
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProject.id, names }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.added > 0 ? `已添加 ${data.added} 个桩号` : '这些桩号已存在，无需重复添加');
        fetchLocations();
      } else {
        alert(data.error || '添加失败');
      }
    } catch (error) {
      console.error('添加桩号失败:', error);
      alert('添加失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const removeLocation = async (item: LocationItem) => {
    if (!item.id || !confirm(`确定删除桩号「${item.name}」吗？`)) return;
    try {
      const res = await fetch(`/api/locations?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchLocations();
      } else {
        alert(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除桩号失败:', error);
      alert('删除失败，请重试');
    }
  };

  const managedCount = locations.filter((l) => l.id).length;

  return (
    <div className="min-h-screen bg-[#F5F6F8] pb-8">
      {/* Header */}
      <div className="bg-white px-4 py-3 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-[#1A1A2E] text-center">桩号管理</h1>
        <p className="text-xs text-gray-400 text-center mt-0.5">
          {currentProject.name} · 已录入 {managedCount} 个，共 {locations.length} 个可选
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 添加单个 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="flex items-center gap-1 text-sm font-medium text-[#1A1A2E] mb-2">
            <MapPin className="w-4 h-4" />添加桩号
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={singleName}
              onChange={(e) => setSingleName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSingle()}
              placeholder="如：K12+300"
              className="flex-1 px-4 py-3 bg-[#F5F6F8] rounded-lg text-sm text-[#1A1A2E] placeholder:text-gray-300"
            />
            <button
              type="button"
              onClick={addSingle}
              disabled={busy || !singleName.trim()}
              className="px-4 py-3 bg-[#1E5AA8] text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> 添加
            </button>
          </div>
        </div>

        {/* 批量导入 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="flex items-center gap-1 text-sm font-medium text-[#1A1A2E] mb-2">
            <Upload className="w-4 h-4" />批量导入（每行一个桩号，也可用逗号分隔）
          </label>
          <textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder={'K0+000\nK0+500\nK1+000, K1+500'}
            className="w-full px-4 py-3 bg-[#F5F6F8] rounded-lg text-sm text-[#1A1A2E] placeholder:text-gray-300 h-28 resize-none"
          />
          <button
            type="button"
            onClick={importBatch}
            disabled={busy || !batchText.trim()}
            className="mt-2 w-full py-3 bg-[#16A34A] text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            导入
          </button>
        </div>

        {/* 列表 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-medium text-[#1A1A2E] mb-3">桩号列表</h3>
          {loading ? (
            <div className="text-center py-8 text-gray-400">加载中...</div>
          ) : locations.length === 0 ? (
            <div className="text-center py-8">
              <MapPin className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">暂无桩号</p>
              <p className="text-gray-300 text-xs mt-1">可单个添加或批量导入</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {locations.map((item) => (
                <div key={item.name} className="flex items-center gap-2 p-2.5 bg-[#F5F6F8] rounded-xl">
                  <MapPin className="w-4 h-4 text-[#1E5AA8] shrink-0" />
                  <span className="flex-1 text-sm text-[#1A1A2E]">{item.name}</span>
                  <button
                    type="button"
                    onClick={() => removeLocation(item)}
                    className="p-1.5 text-red-400 hover:text-red-500 rounded-lg"
                    aria-label={`移除桩号 ${item.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 px-1">
          说明：报工页面只联想这里正式录入的桩号，历史报工中的临时位置不会进入桩号库。
        </p>
      </div>
    </div>
  );
}
