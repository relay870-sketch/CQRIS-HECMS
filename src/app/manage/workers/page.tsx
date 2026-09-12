'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Pencil, Trash2, Users } from 'lucide-react';
import { useProject } from '@/components/project-provider';

interface Worker {
  id: string;
  name: string;
  role: string;
  team: string;
  phone: string;
  join_date: string;
  project_id: string;
}

function WorkersPageInner() {
  const router = useRouter();
  const { currentProject } = useProject();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    team: '',
    phone: '',
    join_date: '',
  });
  const [loading, setLoading] = useState(true);

  // 锁定 body 滚动
  useEffect(() => {
    if (showForm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showForm]);

  useEffect(() => {
    loadWorkers();
  }, [currentProject]);

  const loadWorkers = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workers?projectId=${currentProject.id}`);
      const data = await res.json();
      setWorkers(data);
    } catch (error) {
      console.error('加载人员失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentProject || !formData.name) return;

    const payload = {
      project_id: currentProject.id,
      ...formData,
    };

    try {
      if (editingWorker) {
        await fetch('/api/workers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingWorker.id, ...payload }),
        });
      } else {
        await fetch('/api/workers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      setEditingWorker(null);
      setFormData({ name: '', role: '', team: '', phone: '', join_date: '' });
      loadWorkers();
    } catch (error) {
      console.error('保存人员失败:', error);
    }
  };

  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);
    setFormData({
      name: worker.name,
      role: worker.role,
      team: worker.team,
      phone: worker.phone,
      join_date: worker.join_date,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该人员吗？')) return;
    try {
      await fetch(`/api/workers?id=${id}`, { method: 'DELETE' });
      loadWorkers();
    } catch (error) {
      console.error('删除人员失败:', error);
    }
  };

  const handleOpenForm = () => {
    setEditingWorker(null);
    setFormData({ name: '', role: '', team: '', phone: '', join_date: '' });
    setShowForm(true);
  };

  // 按班组分组
  const groupedWorkers = workers.reduce((acc, worker) => {
    const team = worker.team || '未分组';
    if (!acc[team]) acc[team] = [];
    acc[team].push(worker);
    return acc;
  }, {} as Record<string, Worker[]>);

  return (
    <div className="min-h-screen bg-[#F5F6F8] pt-header safe-area-top">
      {/* 顶部导航 */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-[#1E5AA8] text-white">
        <div className="flex items-center h-12 px-4">
          <button onClick={() => router.back()} className="p-1 -ml-1">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-base font-medium ml-3">人员管理</h1>
          <span className="ml-2 text-sm opacity-80">
            {currentProject?.name || ''}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleOpenForm}
            className="flex items-center gap-1 bg-white/20 px-3 py-1.5 rounded-lg text-sm"
          >
            <Plus size={16} />
            添加
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="pt-14 pb-6 px-4">
        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : workers.length === 0 ? (
          <div className="text-center py-16">
            <Users size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">暂无人员</p>
            <button
              onClick={handleOpenForm}
              className="mt-4 bg-[#1E5AA8] text-white px-6 py-2 rounded-lg text-sm"
            >
              添加第一个人员
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedWorkers).map(([team, teamWorkers]) => (
              <div key={team}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-[#1E5AA8] rounded" />
                  <h3 className="text-sm font-medium text-[#1A1A2E]">{team}</h3>
                  <span className="text-xs text-gray-400">({teamWorkers.length}人)</span>
                </div>
                <div className="space-y-2">
                  {teamWorkers.map((worker) => (
                    <div
                      key={worker.id}
                      className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#1A1A2E]">{worker.name}</span>
                          {worker.role && (
                            <span className="text-xs bg-[#E8F0FE] text-[#1E5AA8] px-2 py-0.5 rounded">
                              {worker.role}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          {worker.phone && <span>{worker.phone}</span>}
                          {worker.join_date && <span>入场: {worker.join_date}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(worker)}
                          className="p-2 text-gray-400 hover:text-[#1E5AA8]"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(worker.id)}
                          className="p-2 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-base font-semibold text-[#1A1A2E]">
                {editingWorker ? '编辑人员' : '添加人员'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">
                  姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入姓名"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">
                  工种
                </label>
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  placeholder="如：电工、管道工、调试员..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E5AA8] bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">
                  所属班组
                </label>
                <input
                  type="text"
                  value={formData.team}
                  onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                  placeholder="如：一组、二组"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">
                  联系电话
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="请输入手机号"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A1A2E] mb-1.5">
                  入场日期
                </label>
                <input
                  type="date"
                  value={formData.join_date}
                  onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-5 py-4 flex gap-3 rounded-b-2xl">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium text-sm"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.name}
                className="flex-1 py-3 bg-[#1E5AA8] text-white rounded-xl font-medium text-sm disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center text-gray-400">
          加载中...
        </div>
      }
    >
      <WorkersPageInner />
    </Suspense>
  );
}
