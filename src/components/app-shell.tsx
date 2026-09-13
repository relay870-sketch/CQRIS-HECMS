'use client';

import { usePathname } from 'next/navigation';
import BottomTabBar from './bottom-tab-bar';
import { AppHeader } from './app-header';
import { Toaster } from './ui/sonner';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login' || pathname.startsWith('/board')) return <><main className="min-h-screen">{children}</main><Toaster position="top-center" /></>;
  return <><AppHeader /><main className="pt-header pb-tab min-h-screen md:pl-56"><div className="mx-auto w-full max-w-[1120px]">{children}</div></main><BottomTabBar /><Toaster position="top-center" /></>;
}
