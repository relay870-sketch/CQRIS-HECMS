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
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-gray-200 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 w-16 h-full transition-colors ${
                isActive ? 'text-[#1E5AA8]' : 'text-gray-400'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[11px] ${isActive ? 'font-semibold' : ''}`}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
