'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FileEdit, ClipboardList, BookOpen, User } from 'lucide-react';

const tabs = [
  { href: '/', label: '首页', icon: Home },
  { href: '/report', label: '报工', icon: FileEdit },
  { href: '/records', label: '记录', icon: ClipboardList },
  { href: '/knowledge', label: '知识库', icon: BookOpen },
  { href: '/profile', label: '我的', icon: User },
];

export default function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 border-t border-gray-200 bg-white md:top-12 md:left-0 md:w-56 md:max-w-none md:translate-x-0 md:border-r md:border-t-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex h-14 items-center justify-around md:h-full md:flex-col md:items-stretch md:justify-start md:gap-1 md:p-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex h-full w-16 flex-col items-center justify-center gap-0.5 transition-colors md:h-11 md:w-full md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 ${
                isActive ? 'text-[#1E5AA8] md:bg-blue-50' : 'text-gray-400 md:hover:bg-gray-50 md:hover:text-gray-600'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[11px] md:text-sm ${isActive ? 'font-semibold' : ''}`}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
