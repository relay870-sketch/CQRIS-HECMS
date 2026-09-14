'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import BottomTabBar from './bottom-tab-bar';
import { AppHeader } from './app-header';
import { Toaster } from './ui/sonner';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const contentWidth = pathname === '/records' ? 'max-w-[1500px]' : 'max-w-[1120px]';
  const [role, setRole] = useState<'admin' | 'reporter' | 'viewer' | null>(null);
  useEffect(() => { void fetch('/api/auth/me').then((response) => response.json()).then((value: { user?: { role?: 'admin' | 'reporter' | 'viewer' } }) => setRole(value.user?.role || null)).catch(() => setRole(null)); }, []);
  if (pathname === '/login' || pathname.startsWith('/board')) return <><main className="min-h-screen">{children}</main><Toaster position="top-center" /></>;
  return <><AppHeader /><main className="pt-header pb-tab min-h-screen md:pl-56">{role === 'viewer' && pathname.startsWith('/manage/') && <div className="mx-auto w-full max-w-[1120px] px-4 pt-3"><div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">只读模式：你可以查看本页面，但不能新增、修改或删除数据。</div></div>}<div className={`mx-auto w-full ${contentWidth}`}>{children}</div></main><BottomTabBar /><Toaster position="top-center" /></>;
}
