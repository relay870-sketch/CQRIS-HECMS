'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Edit2, Trash2, X, Check } from 'lucide-react';
import { useProject } from '@/components/project-provider';
import { ManagePageHeader } from '@/components/manage-page-header';

interface Project {
  id: string;
  name: string;
  section: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  manager: string;
  progress: number;
}

export default function ManageProjectsPage() {
  const { refreshProjects } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    section: '',
    start_date: '',
    end_date: '',
    manager: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  // 弹窗打开时锁定背景滚动
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

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data);
    } catch (error) {
      console.error('获取项目列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateForm = () => {
    setEditingProject(null);
    setFormData({ name: '', section: '', start_date: '', end_date: '', manager: '' });
    setShowForm(true);
  };

  const openEditForm = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      section: project.section,
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      manager: project.manager || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.section) {
      alert('请填写项目名称和标段');
      return;
    }

    setSaving(true);
    try {
      if (editingProject) {
        // Update
        const res = await fetch('/api/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingProject.id,
            ...formData,
            status: editingProject.status,
            progress: editingProject.progress,
          }),
        });
        if (!res.ok) throw new Error('更新失败');
      } else {
        // Create
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error('创建失败');
      }
      setShowForm(false);
      await Promise.all([fetchProjects(), refreshProjects()]);
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(`确定删除项目"${project.name}"吗？\n该操作将同时删除项目下所有人员、报工记录、清单和文档。`)) {
      return;
    }

    try {
      const res = await fetch(`/api/projects?id=${project.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      fetchProjects();
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'in_progress': return '进行中';
      case 'completed': return '已完工';
      case 'suspended': return '已暂停';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-blue-50 text-[#1E5AA8]';
      case 'completed': return 'bg-green-50 text-green-600';
      case 'suspended': return 'bg-gray-100 text-gray-500';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] pb-20">
      <ManagePageHeader title="项目管理" description={`共 ${projects.length} 个项目 · 创建、编辑和维护项目`} action={<button onClick={openCreateForm} className="flex items-center gap-1 rounded-lg bg-[#1E5AA8] px-3 py-2 text-xs text-white"><Plus className="h-4 w-4" />新建</button>} />

      {/* Project List */}
      <div className="mx-auto max-w-5xl space-y-3 p-4 md:hidden">
        {projects.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>暂无项目</p>
            <button
              onClick={openCreateForm}
              className="mt-4 px-4 py-2 bg-[#1E5AA8] text-white rounded-lg text-sm"
            >
              创建第一个项目
            </button>
          </div>
        ) : (
          projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-[#1A1A2E]">{project.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(project.status)}`}>
                      {getStatusLabel(project.status)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{project.section}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>负责人: {project.manager || '未设置'}</span>
                    <span>进度: {project.progress}%</span>
                  </div>
                  {(project.start_date || project.end_date) && (
                    <p className="text-xs text-gray-400 mt-1">
                      {project.start_date || '未设置'} ~ {project.end_date || '未设置'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Link
                    href={`/manage/bom?projectId=${project.id}`}
                    className="p-2 text-[#1E5AA8] hover:bg-blue-50 rounded-lg"
                    title="管理清单"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </Link>
                  <button
                    onClick={() => openEditForm(project)}
                    className="p-2 text-gray-400 hover:text-[#1E5AA8] hover:bg-blue-50 rounded-lg"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(project)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mx-auto hidden max-w-5xl p-4 md:block">
        {projects.length === 0 ? <div className="rounded-2xl bg-white py-16 text-center text-gray-400">暂无项目</div> : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-5 py-3">项目名称</th><th className="px-4 py-3">标段</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">负责人</th><th className="px-4 py-3">工期</th><th className="px-4 py-3">进度</th><th className="px-5 py-3 text-right">操作</th></tr></thead>
              <tbody className="divide-y divide-gray-100">{projects.map((project) => <tr key={project.id} className="hover:bg-blue-50/30">
                <td className="px-5 py-4 font-medium text-gray-900">{project.name}</td><td className="px-4 py-4 text-gray-600">{project.section}</td>
                <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs ${getStatusColor(project.status)}`}>{getStatusLabel(project.status)}</span></td>
                <td className="px-4 py-4 text-gray-600">{project.manager || '未设置'}</td><td className="whitespace-nowrap px-4 py-4 text-xs text-gray-500">{project.start_date || '未设置'} ～ {project.end_date || '未设置'}</td>
                <td className="px-4 py-4"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#1E5AA8]" style={{ width: `${Math.min(project.progress, 100)}%` }} /></div><span className="text-xs font-medium text-[#1E5AA8]">{project.progress}%</span></div></td>
                <td className="px-5 py-4"><div className="flex justify-end gap-1"><Link href={`/manage/bom?projectId=${project.id}`} className="rounded-lg px-2.5 py-1.5 text-xs text-[#1E5AA8] hover:bg-blue-50">清单</Link><button onClick={() => openEditForm(project)} className="rounded-lg p-2 text-gray-500 hover:bg-blue-50 hover:text-[#1E5AA8]" aria-label={`编辑${project.name}`}><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDelete(project)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label={`删除${project.name}`}><Trash2 className="h-4 w-4" /></button></div></td>
              </tr>)}</tbody>
            </table></div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-[480px] bg-white rounded-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold">
                {editingProject ? '编辑项目' : '新建项目'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="如：山东徐民高速机电工程"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  标段 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.section}
                  onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                  placeholder="如：徐民段K0+000~K42+500"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">负责人</label>
                <input
                  type="text"
                  value={formData.manager}
                  onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                  placeholder="项目负责人姓名"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                  />
                </div>
              </div>

              {editingProject && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">项目状态</label>
                  <select
                    value={editingProject.status}
                    onChange={(e) => setEditingProject({ ...editingProject, status: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                  >
                    <option value="in_progress">进行中</option>
                    <option value="completed">已完工</option>
                    <option value="suspended">已暂停</option>
                  </select>
                </div>
              )}

              {editingProject && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    进度 ({editingProject.progress}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={editingProject.progress}
                    onChange={(e) => setEditingProject({ ...editingProject, progress: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full py-3 bg-[#1E5AA8] text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
