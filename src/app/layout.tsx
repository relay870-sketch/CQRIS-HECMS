import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ProjectProvider } from '@/components/project-provider';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: '重庆瑞思施工管理系统',
  description: '重庆瑞思施工管理系统',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <ProjectProvider>
          <AppShell>{children}</AppShell>
        </ProjectProvider>
      </body>
    </html>
  );
}
