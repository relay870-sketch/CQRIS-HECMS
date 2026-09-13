'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, ChevronRight, CircleCheck, ClipboardList, Clock, MapPin, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useProject } from '@/components/project-provider';

interface Report {
  id: string;
  project_id: string;
  date: string;
  location: string;
  work_type: string;
  quantity: number;
  unit: string;
  workers: string;
  issue: string | null;
  notes: string | null;
  work_items?: string | null;
}

interface WorkItem {
  name: string;
  quantity: number;
  unit: string;
  location: string;
  external?: boolean;
  overtimeHours?: number;
  workerCount: number;
}

interface AttendanceRow {
  worker_id: string;
  date: string;
  attendance: 'full' | 'half' | 'absent';
  overtime_hours: number;
}

function parseWorkerIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function parseWorkItems(report: Report): WorkItem[] {
  const reportWorkerCount = new Set(parseWorkerIds(report.workers)).size;
  try {
    const parsed: unknown = JSON.parse(report.work_items || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => {
          const itemWorkers = Array.isArray(item.workers)
            ? item.workers.filter((id): id is string => typeof id === 'string')
            : [];
          return {
          name: typeof item.name === 'string' ? item.name : report.work_type,
          quantity: typeof item.quantity === 'number' ? item.quantity : report.quantity,
          unit: typeof item.unit === 'string' ? item.unit : report.unit,
          location: typeof item.location === 'string' ? item.location : report.location,
          external: item.external === true,
          overtimeHours: typeof item.overtimeHours === 'number' ? item.overtimeHours : 0,
          workerCount: itemWorkers.length > 0 ? new Set(itemWorkers).size : reportWorkerCount,
          };
        });
    }
  } catch {
    // 兼容旧数据
  }
  return [{ name: report.work_type, quantity: report.quantity, unit: report.unit, location: report.location, workerCount: reportWorkerCount }];
}

function countUniqueWorkers(reports: Report[]): number {
  const workerIds = new Set<string>();
  reports.forEach((report) => parseWorkerIds(report.workers).forEach((id) => workerIds.add(id)));
  return workerIds.size;
}

export default function HomePage() {
  const { currentProject, allProjects, isReady, setCurrentProject } = useProject();
  const [reports, setReports] = useState<Report[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isReady || currentProject.name === '加载中...') return;
    async function fetchReports() {
      setLoading(true);
      try {
        const today = new Date().toLocaleDateString('en-CA');
        const since = new Date(); since.setDate(since.getDate() - 6);
        const dateFrom = since.toLocaleDateString('en-CA');
        const [response, attendanceResponse] = await Promise.all([
          fetch(`/api/reports?${new URLSearchParams({ projectId: currentProject.id, date: today, all: '1' })}`),
          fetch(`/api/attendance?${new URLSearchParams({ projectId: currentProject.id, dateFrom })}`),
        ]);
        const [data, attendanceData]: unknown[] = await Promise.all([response.json(), attendanceResponse.json()]);
        setReports(Array.isArray(data) ? data as Report[] : []);
        setAttendanceRows(Array.isArray(attendanceData) ? attendanceData as AttendanceRow[] : []);
      } catch (error) {
        console.error('Failed to fetch reports:', error);
        setReports([]);
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, [currentProject.id, currentProject.name, isReady]);

  if (!isReady || loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F3F5F8] text-sm text-gray-400">加载中...</div>;
  }

  const today = new Date().toLocaleDateString('en-CA');
  const todayReports = reports.filter((report) => report.date === today);
  const todayItems = todayReports.flatMap(parseWorkItems);
  const todayAttendance = attendanceRows.filter((row) => row.date === today && row.attendance !== 'absent');
  const todayWorkers = todayAttendance.length > 0 ? new Set(todayAttendance.map((row) => row.worker_id)).size : countUniqueWorkers(todayReports);
  const todayExternalCount = todayItems.filter((item) => item.external).length;
  const todayOvertimeItems = todayItems.filter((item) => (item.overtimeHours || 0) > 0);
  const fallbackOvertimePersonHours = todayOvertimeItems.reduce(
    (total, item) => total + (item.overtimeHours || 0) * item.workerCount,
    0,
  );
  const todayOvertimePersonHours = todayAttendance.length > 0
    ? todayAttendance.reduce((sum, row) => sum + row.overtime_hours, 0)
    : fallbackOvertimePersonHours;
  const todayNotes = todayReports.filter((report) => report.issue?.trim() || report.notes?.trim());
  const hasAttention = todayExternalCount > 0 || todayOvertimePersonHours > 0 || todayNotes.length > 0;

  const weeklyAttendance: Array<{ date: string; 出勤人数: number }> = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const dateString = date.toLocaleDateString('en-CA');
    weeklyAttendance.push({
      date: dateString.slice(5),
      出勤人数: attendanceRows.some((row) => row.date === dateString)
        ? new Set(attendanceRows.filter((row) => row.date === dateString && row.attendance !== 'absent').map((row) => row.worker_id)).size
        : countUniqueWorkers(reports.filter((report) => report.date === dateString)),
    });
  }

  return (
    <div className="min-h-screen bg-[#F3F5F8] pb-6">
      <div className="space-y-3.5 px-4 py-4">
        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E5AA8] to-[#16457F] p-4 text-white shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-xs text-white/65">当前项目</div>
              <h1 className="truncate text-lg font-semibold">{currentProject.name}</h1>
              <p className="mt-1 truncate text-xs text-white/70">{currentProject.section}</p>
            </div>
            <select
              aria-label="切换项目"
              value={currentProject.id}
              onChange={(event) => {
                const project = allProjects.find((item) => item.id === event.target.value);
                if (project) setCurrentProject(project);
              }}
              className="max-w-[108px] rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs text-white outline-none"
            >
              {allProjects.map((project) => <option key={project.id} value={project.id} className="text-[#1A1A2E]">{project.name}</option>)}
            </select>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-white/70">负责人：{currentProject.manager || '未设置'}</span>
            <span className="font-semibold">
              {currentProject.pricing_complete ? `自动进度 ${currentProject.progress}%` : `暂用人工进度 ${currentProject.progress}%`}
            </span>
          </div>
          {!currentProject.pricing_complete && (
            <p className="mt-1.5 text-[11px] text-white/65">清单单价补充完整后，将按合同金额自动计算</p>
          )}
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.max(0, currentProject.progress))}%` }} />
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[15px] font-semibold">今日概览</h2>
            <span className="text-xs text-gray-400">{today.slice(5).replace('-', '月')}日</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <Users className="mb-2 h-4 w-4 text-[#16A34A]" /><div className="text-xl font-bold">{todayWorkers}</div><div className="mt-0.5 text-[11px] text-gray-400">出勤人数</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <ClipboardList className="mb-2 h-4 w-4 text-[#1E5AA8]" /><div className="text-xl font-bold">{todayItems.length}</div><div className="mt-0.5 text-[11px] text-gray-400">施工内容</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              {todayReports.length > 0 ? <CircleCheck className="mb-2 h-4 w-4 text-[#16A34A]" /> : <Clock className="mb-2 h-4 w-4 text-[#E8740C]" />}
              <div className={`text-sm font-semibold ${todayReports.length > 0 ? 'text-[#16A34A]' : 'text-[#E8740C]'}`}>{todayReports.length > 0 ? '已报工' : '待报工'}</div>
              <div className="mt-1.5 text-[11px] text-gray-400">今日状态</div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2.5">
          <Link href="/report" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#16A34A] text-sm font-semibold text-white shadow-sm active:scale-[0.99]"><ClipboardList className="h-4 w-4" />填写今日报工</Link>
          <Link href="/records" className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#BCD0EB] bg-white text-sm font-semibold text-[#1E5AA8] shadow-sm active:scale-[0.99]"><CalendarDays className="h-4 w-4" />查看施工记录</Link>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div><h2 className="text-[15px] font-semibold">今日施工内容</h2><p className="mt-0.5 text-xs text-gray-400">{todayItems.length > 0 ? `共 ${todayItems.length} 项` : '尚未提交今日报工'}</p></div>
            {todayItems.length > 0 && <Link href="/records" className="flex items-center text-xs text-[#1E5AA8]">详情<ChevronRight className="h-3.5 w-3.5" /></Link>}
          </div>
          {todayItems.length > 0 ? (
            <div className="space-y-2.5">
              {todayItems.map((item, index) => (
                <div key={`${item.name}-${item.location}-${index}`} className="rounded-xl bg-[#F7F9FC] p-3">
                  <div className="flex min-w-0 items-start gap-2"><span className="min-w-0 flex-1 text-sm font-medium leading-5 break-words">{item.name}</span><span className="shrink-0 text-sm font-semibold text-[#1E5AA8]">{item.quantity}{item.unit}</span></div>
                  <div className="mt-1 flex min-w-0 items-start gap-1 text-xs leading-5 text-gray-500"><MapPin className="mt-1 h-3 w-3 shrink-0" /><span className="min-w-0 break-all">{item.location}</span></div>
                </div>
              ))}
            </div>
          ) : (
            <Link href="/report" className="flex items-center justify-between rounded-xl border border-dashed border-[#BCD0EB] bg-[#F5F9FF] p-3.5 text-sm text-[#1E5AA8]"><span>今日尚未报工，立即填写</span><ChevronRight className="h-4 w-4" /></Link>
          )}
        </section>

        {hasAttention && (
          <section className="rounded-2xl border border-[#F5D7B5] bg-[#FFF9F2] p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-[#E8740C]" /><h2 className="text-[15px] font-semibold text-[#9A4A00]">今日待关注</h2></div>
            <div className="space-y-2 text-sm text-[#7A4A1B]">
              {todayExternalCount > 0 && <div>合同外施工 {todayExternalCount} 项</div>}
              {todayOvertimePersonHours > 0 && (
                <div>
                  <div>累计加班 {Math.round(todayOvertimePersonHours * 10) / 10} 人时</div>
                  {todayAttendance.length === 0 && <div className="mt-0.5 text-xs text-[#A66A30]">{todayOvertimeItems.map((item) => `${item.workerCount}人 × ${item.overtimeHours}小时`).join(' + ')}</div>}
                </div>
              )}
              {todayNotes.map((report) => <div key={report.id} className="leading-5 break-words">现场说明：{report.issue || report.notes}</div>)}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-2"><h2 className="text-[15px] font-semibold">近 7 天出勤</h2><p className="mt-0.5 text-xs text-gray-400">当前项目 · 每日人员去重统计</p></div>
          <div className="h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyAttendance} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={22} />
                <Tooltip formatter={(value) => [`${value} 人`, '出勤人数']} />
                <Bar dataKey="出勤人数" fill="#1E5AA8" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
