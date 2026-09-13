'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface ManagePageHeaderProps {
  title: string;
  description: string;
  backHref?: string;
  action?: ReactNode;
}

export function ManagePageHeader({ title, description, backHref = '/profile', action }: ManagePageHeaderProps) {
  return (
    <header className="sticky top-12 z-30 border-b border-gray-100 bg-white">
      <div className="mx-auto flex min-h-16 max-w-5xl items-center gap-2 px-3 py-2.5 sm:px-4">
        <Link href={backHref} className="shrink-0 rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100" aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-gray-900">{title}</h1>
          <p className="truncate text-xs text-gray-400">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
