'use client';

import { useEffect, useState } from 'react';
import { Clock3, Save, Users } from 'lucide-react';
import { useProject } from '@/components/project-provider';

interface Worker { id: string; name: string; team: string; role: string }
interface AttendanceRow { worker_id: string; attendance: 'full' | 'half' | 'absent'; overtime_hours: number }
interface Entry { attendance: 'full' | 'half' | 'absent'; overtimeHours: string }

const attendanceOptions = [
  { value: 'full', symbol: '✓', label: '全天', active: 'border-emerald-500 bg-emerald-500 text-white' },
  { value: 'half', symbol: '◐', label: '半天', active: 'border-amber-500 bg-amber-500 text-white' },
  { value: 'absent', symbol: '—', label: '未出勤', active: 'border-gray-400 bg-gray-500 text-white' },
] as const;

export default function AttendanceManagementPage() {
  const { currentProject } = useProject();
  const [date, setDate] = useState('');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDate(new Date().toLocaleDateString('en-CA'));
  }, []);

  useEffect(() => {
    if (!date) return;
    async function load() {
      setLoading(true);
      try {
        const [workersRes, attendanceRes] = await Promise.all([
          fetch(`/api/workers?projectId=${currentProject.id}`),
          fetch(`/api/attendance?projectId=${currentProject.id}&date=${date}`),
        ]);
        const workerData: unknown = await workersRes.json();
        const attendanceData: unknown = await attendanceRes.json();
        const list = Array.isArray(workerData) ? workerData as Worker[] : [];
        const rows = Array.isArray(attendanceData) ? attendanceData as AttendanceRow[] : [];
        const rowMap = new Map(rows.map((row) => [row.worker_id, row]));
        setWorkers(list);
        setEntries(Object.fromEntries(list.map((worker) => {
          const row = rowMap.get(worker.id);
          return [worker.id, { attendance: row?.attendance || 'absent', overtimeHours: String(row?.overtime_hours || '') }];
        })));
      } finally { setLoading(false); }
    }
    void load();
  }, [currentProject.id, date]);

  const summary = workers.reduce((result, worker) => {
    const entry = entries[worker.id];
    if (entry) result[entry.attendance] += 1;
    result.overtime += Number(entry?.overtimeHours || 0);
    return result;
  }, { full: 0, half: 0, absent: 0, overtime: 0 });

  const update = (workerId: string, patch: Partial<Entry>) => setEntries((current) => ({
    ...current, [workerId]: { ...current[workerId], ...patch },
  }));

  const save = async () => {
    if (!reason.trim()) return alert('请填写本次考勤修正原因');
    setSaving(true);
    try {
      const response = await fetch('/api/attendance', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProject.id, date, reason, entries: workers.map((worker) => ({
          workerId: worker.id, attendance: entries[worker.id]?.attendance || 'absent',
          overtimeHours: Number(entries[worker.id]?.overtimeHours || 0),
        })) }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '保存失败');
      alert('考勤已保存'); setReason('');
    } catch (error) { alert(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(false); }
  };

  return <div className="min-h-screen bg-[#F5F6F8] px-3 py-3 pb-24 sm:px-4">
    <div className="rounded-2xl bg-white p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div><div className="text-sm font-semibold text-gray-900">每日考勤总览</div><div className="mt-0.5 text-xs text-gray-400">点击符号即可修正状态</div></div>
        <input aria-label="考勤日期" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm font-medium" />
      </div>
      <div className="mt-3 grid grid-cols-4 divide-x divide-gray-100 rounded-xl bg-gray-50 py-2.5 text-center">
        <div><div className="text-base font-bold text-emerald-600">{summary.full}</div><div className="text-[11px] text-gray-500">✓ 全天</div></div>
        <div><div className="text-base font-bold text-amber-600">{summary.half}</div><div className="text-[11px] text-gray-500">◐ 半天</div></div>
        <div><div className="text-base font-bold text-gray-500">{summary.absent}</div><div className="text-[11px] text-gray-500">— 未勤</div></div>
        <div><div className="text-base font-bold text-[#1E5AA8]">{summary.overtime}</div><div className="text-[11px] text-gray-500">加班/时</div></div>
      </div>
    </div>

    <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm md:hidden">
      <div className="grid grid-cols-[minmax(84px,1fr)_132px_62px] items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-medium text-gray-400">
        <span>人员</span><span className="text-center">全天　半天　未勤</span><span className="text-center">加班</span>
      </div>
      {loading ? <div className="py-10 text-center text-sm text-gray-400">加载中...</div> : workers.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">当前项目暂无人员</div> : workers.map((worker) => (
        <div key={worker.id} className="grid grid-cols-[minmax(84px,1fr)_132px_62px] items-center gap-2 border-b border-gray-100 px-3 py-2.5 last:border-b-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 shrink-0 text-[#1E5AA8]" /><span className="truncate text-sm font-semibold text-gray-800">{worker.name}</span></div>
            <div className="mt-0.5 truncate pl-5 text-[10px] text-gray-400">{worker.team} · {worker.role}</div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {attendanceOptions.map((option) => {
              const selected = entries[worker.id]?.attendance === option.value;
              return <button key={option.value} type="button" title={option.label} aria-label={`${worker.name}${option.label}`} aria-pressed={selected}
                onClick={() => update(worker.id, { attendance: option.value })}
                className={`h-9 rounded-lg border text-base font-bold transition-colors ${selected ? option.active : 'border-gray-200 bg-white text-gray-300'}`}>{option.symbol}</button>;
            })}
          </div>
          <label className="relative block">
            <Clock3 className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#1E5AA8]" />
            <input aria-label={`${worker.name}加班小时`} type="number" min="0" max="24" step="0.5" value={entries[worker.id]?.overtimeHours || ''} onChange={(event) => update(worker.id, { overtimeHours: event.target.value })}
              placeholder="0" className="h-9 w-full rounded-lg border border-gray-200 pl-5 pr-1 text-center text-sm font-medium outline-none focus:border-[#1E5AA8]" />
          </label>
        </div>
      ))}
    </div>
    <div className="mt-4 hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
      {loading ? <div className="py-12 text-center text-sm text-gray-400">加载中...</div> : workers.length === 0 ? <div className="py-12 text-center text-sm text-gray-400">当前项目暂无人员</div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs font-medium text-gray-500"><tr>
              <th className="px-5 py-3">姓名</th><th className="px-4 py-3">班组</th><th className="px-4 py-3">岗位</th>
              <th className="px-4 py-3 text-center">出勤状态</th><th className="w-32 px-4 py-3 text-center">加班小时</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">{workers.map((worker) => (
              <tr key={worker.id} className="hover:bg-blue-50/30">
                <td className="px-5 py-3 font-medium text-gray-900">{worker.name}</td><td className="px-4 py-3 text-gray-600">{worker.team || '未分组'}</td><td className="px-4 py-3 text-gray-600">{worker.role || '—'}</td>
                <td className="px-4 py-3"><div className="mx-auto grid max-w-64 grid-cols-3 gap-2">{attendanceOptions.map((option) => {
                  const selected = entries[worker.id]?.attendance === option.value;
                  return <button key={option.value} type="button" aria-label={`${worker.name}${option.label}`} aria-pressed={selected} onClick={() => update(worker.id, { attendance: option.value })}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium ${selected ? option.active : 'border-gray-200 bg-white text-gray-500 hover:border-[#1E5AA8]'}`}>{option.symbol} {option.label}</button>;
                })}</div></td>
                <td className="px-4 py-3"><input aria-label={`${worker.name}加班小时`} type="number" min="0" max="24" step="0.5" value={entries[worker.id]?.overtimeHours || ''} onChange={(event) => update(worker.id, { overtimeHours: event.target.value })}
                  placeholder="0" className="mx-auto block h-9 w-24 rounded-lg border border-gray-200 px-2 text-center outline-none focus:border-[#1E5AA8]" /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
    <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="修正原因（必填），如：补录昨日漏报考勤"
      className="mt-3 min-h-16 w-full resize-none rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm outline-none focus:border-amber-400" />
    <button type="button" disabled={saving || loading || !date} onClick={save} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E5AA8] py-3 font-medium text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中...' : '保存考勤修正'}</button>
  </div>;
}
