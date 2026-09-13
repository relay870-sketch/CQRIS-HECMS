'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useProject } from '@/components/project-provider';
import { Users, ChevronRight, Settings, User, MapPin, Layers, Clock, ShieldCheck, ScrollText, DatabaseBackup, Bot } from 'lucide-react';

interface Worker {
  id: string;
  name: string;
  role: string;
  team: string;
  phone: string;
  join_date: string;
}

export default function ProfilePage() {
  const { currentProject } = useProject();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Array<{id: string; name: string}>>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ name: string; username: string; role: 'admin' | 'reporter' | 'viewer' } | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [workersRes, projectsRes, meRes] = await Promise.all([
          fetch(`/api/workers?projectId=${currentProject.id}`),
          fetch('/api/projects'),
          fetch('/api/auth/me'),
        ]);
        const [workersData, projectsData, meData] = await Promise.all([
          workersRes.json(),
          projectsRes.json(),
          meRes.json(),
        ]);
        setWorkers(workersData);
        setProjects(projectsData);
        const userData = meData as { user?: { name: string; username: string; role: 'admin' | 'reporter' | 'viewer' } };
        setCurrentUser(userData.user || null);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [currentProject.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] pb-6">
      {/* User Info */}
      <div className="px-4 py-4">
        <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-12 h-12 bg-[#1E5AA8] rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-[#1A1A2E]">{currentUser?.name || '当前用户'}</div>
            <div className="text-xs text-gray-400">{currentUser?.role === 'admin' ? 'admin · ' : ''}{currentProject.name}</div>
          </div>
          <Settings className="w-5 h-5 text-gray-300" />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <Link
            href="/manage/projects"
            className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 active:bg-gray-50"
          >
            <Settings className="w-5 h-5 text-[#1E5AA8]" />
            <span className="flex-1 text-left text-sm text-[#1A1A2E]">项目管理</span>
            <span className="text-xs text-gray-400 mr-1">{projects.length}个项目</span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
          <Link
            href={`/manage/workers?projectId=${currentProject.id}`}
            className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 active:bg-gray-50"
          >
            <Users className="w-5 h-5 text-[#1E5AA8]" />
            <span className="flex-1 text-left text-sm text-[#1A1A2E]">人员管理</span>
            <span className="text-xs text-gray-400 mr-1">{workers.length}人</span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
          <Link
            href={`/manage/locations`}
            className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 active:bg-gray-50"
          >
            <MapPin className="w-5 h-5 text-[#E8740C]" />
            <span className="flex-1 text-left text-sm text-[#1A1A2E]">桩号管理</span>
            <span className="text-xs text-gray-400 mr-1">添加/批量导入</span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
          <Link href="/manage/attendance" className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 active:bg-gray-50">
            <Clock className="w-5 h-5 text-[#16A34A]" />
            <span className="flex-1 text-left text-sm text-[#1A1A2E]">考勤管理</span>
            <span className="text-xs text-gray-400 mr-1">补录/修正</span><ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
          <Link
            href={`/manage/systems`}
            className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
          >
            <Layers className="w-5 h-5 text-[#7C3AED]" />
            <span className="flex-1 text-left text-sm text-[#1A1A2E]">子系统管理</span>
            <span className="text-xs text-gray-400 mr-1">监控/收费/通信等</span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
          {currentUser?.role === 'admin' && <Link href="/manage/accounts" className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
            <ShieldCheck className="w-5 h-5 text-[#1E5AA8]" />
            <span className="flex-1 text-left text-sm text-[#1A1A2E]">账号与登录</span>
            <span className="text-xs text-gray-400 mr-1">审核/启停</span><ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>}
          {currentUser?.role === 'admin' && <Link href="/manage/audit-logs" className="w-full flex items-center gap-3 px-4 py-3.5 border-t border-gray-50 active:bg-gray-50">
            <ScrollText className="w-5 h-5 text-[#7C3AED]" />
            <span className="flex-1 text-left text-sm text-[#1A1A2E]">操作日志</span>
            <span className="text-xs text-gray-400 mr-1">查询/导出</span><ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>}
          {currentUser?.role === 'admin' && <Link href="/manage/ai" className="flex w-full items-center gap-3 border-t border-gray-50 px-4 py-3.5 active:bg-gray-50">
            <Bot className="h-5 w-5 text-[#1E5AA8]" />
            <span className="flex-1 text-left text-sm text-[#1A1A2E]">AI 配置</span>
            <span className="mr-1 text-xs text-gray-400">模型/API</span><ChevronRight className="h-4 w-4 text-gray-300" />
          </Link>}
          {currentUser?.role === 'admin' && <Link href="/manage/backups" className="flex w-full items-center gap-3 border-t border-gray-50 px-4 py-3.5 active:bg-gray-50">
            <DatabaseBackup className="h-5 w-5 text-[#16A34A]" />
            <span className="flex-1 text-left text-sm text-[#1A1A2E]">数据备份</span>
            <span className="mr-1 text-xs text-gray-400">备份/恢复</span><ChevronRight className="h-4 w-4 text-gray-300" />
          </Link>}
        </div>
      </div>

    </div>
  );
}
