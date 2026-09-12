import { redirect } from 'next/navigation';

// 项目概况已统一到首页，保留旧地址兼容历史收藏和外部链接。
export default function LegacyProjectDetailPage() {
  redirect('/');
}
