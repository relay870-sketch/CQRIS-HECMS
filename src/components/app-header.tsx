'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { ProjectSelector } from './project-provider';

function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/report')) return '报工';
  if (pathname.startsWith('/records')) return '记录';
  if (pathname.startsWith('/knowledge')) return '知识库';
  if (pathname.startsWith('/profile')) return '我的';
  if (pathname.startsWith('/manage/projects')) return '项目管理';
  if (pathname.startsWith('/manage/workers')) return '人员管理';
  if (pathname.startsWith('/manage/bom')) return '清单管理';
  if (pathname.startsWith('/manage/locations')) return '桩号管理';
  if (pathname.startsWith('/manage/systems')) return '子系统管理';
  if (pathname.startsWith('/manage/attendance')) return '考勤管理';
  if (pathname.startsWith('/manage/accounts')) return '账号管理';
  if (pathname.startsWith('/project/')) return '项目详情';
  if (pathname.startsWith('/documents/')) return '文档预览';
  return '';
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === '/';
  const title = getPageTitle(pathname);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    async function loadUser() {
      const response = await fetch('/api/auth/me');
      if (!response.ok) return;
      const result = await response.json() as { user?: { name?: string } };
      setUserName(result.user?.name || '');
    }
    void loadUser();
  }, []);

  return (
    <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-[#1E5AA8] z-50 safe-area-top">
      <div className="relative flex items-center justify-between h-12 px-3">
        {/* 左侧：项目选择器 */}
        <div className="flex items-center min-w-0">
          {!isHome && <ProjectSelector />}
        </div>

        {/* 中间：页面名称（居中） */}
        <div className={`pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center justify-center text-white font-bold ${isHome ? 'max-w-[60%] gap-1.5 text-sm' : 'max-w-[45%] text-lg'}`}>
          {isHome && <Image src="/chongqing-ruisi-logo.png" alt="重庆瑞思 Logo" width={24} height={24} priority className="h-6 w-6 shrink-0 object-contain" />}
          <span className="truncate">{isHome ? '重庆瑞思施工管理系统' : title}</span>
        </div>

        {/* 右侧：当前登录人员 + 退出 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-white text-xs bg-white/15 px-2 py-1 rounded-md"
            title="当前登录人员"
          >
            {userName || '用户'}
          </span>
          <button
            type="button"
            onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); router.refresh(); }}
            className="text-white/80 hover:text-white p-1.5 rounded-lg transition-colors"
            title="退出登录"
            aria-label="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
