'use client';

import { Fragment, useState, useEffect } from 'react';
import { useProject } from '@/components/project-provider';
import { Calendar, MapPin, Users, Camera, ChevronDown, Search, List, Clock, X, Download, Pencil } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PhotoViewer } from '@/components/photo-viewer';
import { toast } from 'sonner';

interface Report {
  id: string;
  project_id: string;
  date: string;
  location: string;
  lane: string | null;
  device_point: string | null;
  work_type: string;
  quantity: number;
  unit: string;
  workers: string;
  weather: string | null;
  issue: string | null;
  quality_checks: string;
  photos: string;
  notes: string | null;
  submitter: string;
  work_items?: string | null;
  system?: string | null;
  created_at: string;
}

interface WorkItemDetail {
  name: string;
  unit: string;
  quantity: number;
  location?: string;
  attendance?: 'full' | 'half' | 'none';
  overtimeHours?: number;
  external?: boolean;
  workers?: string[];
}

interface ReportPagination { page: number; pageSize: number; total: number; totalPages: number }

interface Worker {
  id: string;
  name: string;
}

export default function RecordsPage() {
  const { currentProject } = useProject();
  const [reports, setReports] = useState<Report[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ name: string; url: string } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [pagination, setPagination] = useState<ReportPagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

  // 导出相关状态
  const [showExport, setShowExport] = useState(false);
  const [exportType, setExportType] = useState<'reports' | 'attendance'>('reports');
  const [reportRange, setReportRange] = useState<'current' | 'month' | 'lastMonth' | 'custom'>('current');
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject.id, pagination.page, pagination.pageSize, filterDate, searchQuery]);


  async function fetchData() {
    setLoading(true);
    try {
      const [reportsRes, workersRes] = await Promise.all([
        fetch(`/api/reports?${new URLSearchParams({ projectId: currentProject.id, page: String(pagination.page), pageSize: String(pagination.pageSize), ...(filterDate && { date: filterDate }), ...(searchQuery && { keyword: searchQuery }) })}`),
        fetch(`/api/workers?projectId=${currentProject.id}`),
      ]);
      const [reportsData, workersData] = await Promise.all([
        reportsRes.json(),
        workersRes.json(),
      ]);
      const paged = reportsData as { items?: unknown; pagination?: ReportPagination };
      setReports(Array.isArray(paged.items) ? paged.items as Report[] : []);
      if (paged.pagination) setPagination(paged.pagination);
      setWorkers(Array.isArray(workersData) ? workersData as Worker[] : []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteReport = async (id: string) => {
    if (!confirm('确定删除这条施工记录吗？删除后不可恢复，关联的工程量进度也会回退。')) return;
    try {
      const res = await fetch(`/api/reports?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('记录已删除');
        setExpandedId(null);
        fetchData();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('删除失败，请重试');
    }
  };

  const parseStringArray = (value: string): string[] => {
    try {
      const parsed: unknown = JSON.parse(value || '[]');
      return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
    } catch {
      return [];
    }
  };

  const parseWorkItems = (value: string | null | undefined): WorkItemDetail[] => {
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
        .map((it) => ({
          name: typeof it.name === 'string' ? it.name : '',
          unit: typeof it.unit === 'string' ? it.unit : '',
          quantity: typeof it.quantity === 'number' ? it.quantity : 0,
          location: typeof it.location === 'string' ? it.location : '',
          attendance: (it.attendance === 'half' ? 'half' : it.attendance === 'none' ? 'none' : 'full') as WorkItemDetail['attendance'],
          overtimeHours: typeof it.overtimeHours === 'number' ? it.overtimeHours : 0,
          external: it.external === true,
          workers: Array.isArray(it.workers) ? it.workers.filter((w): w is string => typeof w === 'string') : [],
        }))
        .filter((it) => it.name);
    } catch {
      return [];
    }
  };

  const parsePhotos = (value: string): Array<{ name: string; url: string }> => {
    try {
      const parsed: unknown = JSON.parse(value || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({ name: typeof p.name === 'string' ? p.name : '', url: typeof p.url === 'string' ? p.url : '' }))
        .filter((p) => p.url);
    } catch {
      return [];
    }
  };

  const formatSubmittedAt = (value: string): string => {
    if (!value) return '时间未知';
    // SQLite datetime('now') 保存的是 UTC；显式补充时区后再转换为本地时间。
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date).replaceAll('/', '-');
  };

  const formatSubmittedTime = (value: string): string => {
    const full = formatSubmittedAt(value);
    const match = full.match(/(\d{2}:\d{2}:\d{2})$/);
    return match?.[1] || '时间未知';
  };

  const filteredReports = reports.filter(r => {
    if (filterDate && r.date !== filterDate) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchLocation = r.location.toLowerCase().includes(q);
      const matchWork = r.work_type.toLowerCase().includes(q) || (r.work_items || '').toLowerCase().includes(q);
      let matchWorker = false;
      try {
        const ids = JSON.parse(r.workers || '[]') as string[];
        matchWorker = ids.some((id) => {
          const w = workers.find((x) => x.id === id);
          return !!w && w.name.toLowerCase().includes(q);
        });
      } catch {
        // 忽略人员解析失败
      }
      if (!matchLocation && !matchWork && !matchWorker) return false;
    }
    return true;
  });

  const applySearch = () => {
    setPagination((current) => ({ ...current, page: 1 }));
    setSearchQuery(searchDraft.trim());
  };
  const clearSearch = () => {
    setSearchDraft('');
    setPagination((current) => ({ ...current, page: 1 }));
    setSearchQuery('');
  };

  // ---------- 导出功能 ----------
  const getWorkerName = (id: string) => {
    const w = workers.find((x) => x.id === id);
    return w?.name || id;
  };

  const getSubmitterName = (submitter: string): string =>
    !submitter || submitter === '当前用户' ? '管理员' : submitter;

  const parseWorkerIds = (json: string): string[] => {
    try {
      const arr = JSON.parse(json || '[]');
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };

  const parseWorkItemsForExport = (report: Report): string => {
    if (!report.work_items) {
      return `${report.work_type} ${report.quantity}${report.unit}`;
    }
    try {
      const items = JSON.parse(report.work_items) as WorkItemDetail[];
      if (Array.isArray(items) && items.length > 0) {
        return items.map((it) => `${it.name} ${it.quantity}${it.unit}`).join('；');
      }
    } catch {
      // 忽略
    }
    return `${report.work_type} ${report.quantity}${report.unit}`;
  };

  const getAttendanceDetails = (report: Report) => {
    const reportWorkerIds = parseStringArray(report.workers);
    const items = parseWorkItems(report.work_items);
    const attendanceItems = items.length > 0 ? items : [{
      name: report.work_type,
      unit: report.unit,
      quantity: report.quantity,
      attendance: 'full' as const,
      overtimeHours: 0,
      workers: reportWorkerIds,
    }];

    return attendanceItems.map((item) => {
      const workerIds = item.workers && item.workers.length > 0 ? item.workers : reportWorkerIds;
      return {
        name: item.name,
        workerNames: workerIds.map(getWorkerName).join('、') || '未关联人员',
        attendanceLabel: item.attendance === 'half' ? '半天' : item.attendance === 'none' ? '不计考勤' : '全天',
        overtimeHours: item.overtimeHours || 0,
      };
    });
  };

  // 按导出范围筛选记录
  const getExportReports = async (): Promise<Report[]> => {
    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPrefix = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const params = new URLSearchParams({ projectId: currentProject.id, all: '1' });
    if (reportRange === 'current') {
      if (filterDate) params.set('date', filterDate);
      if (searchQuery) params.set('keyword', searchQuery);
    } else if (reportRange === 'month') {
      params.set('dateFrom', `${exportMonth}-01`); params.set('dateTo', `${exportMonth}-31`);
    } else if (reportRange === 'lastMonth') {
      params.set('dateFrom', `${lastMonthPrefix}-01`); params.set('dateTo', `${lastMonthPrefix}-31`);
    } else if (reportRange === 'custom') {
      if (!customStart || !customEnd) return [];
      params.set('dateFrom', customStart); params.set('dateTo', customEnd);
    }
    const response = await fetch(`/api/reports?${params}`);
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as Report[]).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) : [];
  };

  const doExportReports = async () => {
    const list = await getExportReports();
    if (list.length === 0) {
      toast.info('没有符合条件的数据可导出');
      return;
    }
    const parseNature = (r: Report): string => {
      if (!r.work_items) return '全天';
      try {
        const items = JSON.parse(r.work_items) as Array<{ attendance?: string; overtimeHours?: number; external?: boolean }>;
        if (Array.isArray(items) && items.length > 0) {
          return items.map((it) => {
            const parts: string[] = [];
            if (it.attendance === 'half') parts.push('半天');
            else if (it.attendance === 'full') parts.push('全天');
            if ((it.overtimeHours || 0) > 0) parts.push(`加班${it.overtimeHours}h`);
            if (it.external) parts.push('合同外');
            return parts.length > 0 ? parts.join('/') : '—';
          }).join('、');
        }
      } catch {
        // 忽略
      }
      return '全天';
    };

    const rows = list.map((r) => ({
      '日期': r.date,
      '系统': r.system || '',
      '桩号/位置': r.location,
      '施工内容': parseWorkItemsForExport(r),
      '性质': parseNature(r),
      '参与人员': parseWorkerIds(r.workers).map(getWorkerName).join('、'),
      '天气': r.weather || '',
      '现场说明': r.notes || '',
      '提交人': getSubmitterName(r.submitter),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 24 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '施工记录');
    const rangeLabel = reportRange === 'month' ? exportMonth : reportRange === 'lastMonth' ? '上月' : reportRange === 'custom' ? `${customStart}~${customEnd}` : '当前筛选';
    XLSX.writeFile(wb, `施工记录_${currentProject.name}_${rangeLabel}.xlsx`);
    setShowExport(false);
  };

  const doExportAttendance = async () => {
    const prefix = exportMonth;
    const response = await fetch(`/api/reports?${new URLSearchParams({ projectId: currentProject.id, all: '1', dateFrom: `${prefix}-01`, dateTo: `${prefix}-31` })}`);
    const data: unknown = await response.json();
    const monthReports = Array.isArray(data) ? data as Report[] : [];
    if (monthReports.length === 0) {
      toast.info(`${prefix} 月份暂无报工，无法导出考勤`);
      return;
    }
    interface AttendanceRow {
      dayWeights: Map<string, number>;
      overtimeHours: number;
      overtimeDates: Set<string>;
    }
    const attendance = new Map<string, AttendanceRow>();
    for (const r of monthReports) {
      let items: Array<{ attendance?: string; overtimeHours?: number; workers?: string[] }> = [];
      try {
        const parsed = JSON.parse(r.work_items || '[]');
        items = Array.isArray(parsed) ? parsed : [];
      } catch {
        // 忽略
      }

      // 旧数据无 work_items 时回退到报工级人员
      if (items.length === 0) {
        items = [{ attendance: 'full', overtimeHours: 0, workers: parseWorkerIds(r.workers) }];
      }

      for (const it of items) {
        const weight = it.attendance === 'half' ? 0.5 : it.attendance === 'none' ? 0 : 1;
        const ot = typeof it.overtimeHours === 'number' ? it.overtimeHours : 0;
        const ids = Array.isArray(it.workers) ? it.workers.filter((w): w is string => typeof w === 'string') : [];

        for (const id of ids) {
          if (!attendance.has(id)) {
            attendance.set(id, { dayWeights: new Map(), overtimeHours: 0, overtimeDates: new Set() });
          }
          const row = attendance.get(id)!;
          const prev = row.dayWeights.get(r.date) || 0;
          if (weight > prev) row.dayWeights.set(r.date, weight);
          if (ot > 0) {
            row.overtimeHours += ot;
            row.overtimeDates.add(r.date);
          }
        }
      }
    }
    const rows = [...attendance.entries()]
      .map(([id, row]) => {
        const totalDays = [...row.dayWeights.values()].reduce((s, w) => s + w, 0);
        return {
          '姓名': getWorkerName(id),
          '出勤（天）': totalDays,
          '加班（小时）': row.overtimeHours || '-',
          '加班日期': [...row.overtimeDates].sort().map((d) => d.slice(8)).join('、') || '-',
          '出勤日期': [...row.dayWeights.keys()].sort().map((d) => d.slice(8)).join('、'),
        };
      })
      .sort((a, b) => (b['出勤（天）'] as number) - (a['出勤（天）'] as number));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 24 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '考勤记录');
    XLSX.writeFile(wb, `考勤记录_${currentProject.name}_${prefix}.xlsx`);
    setShowExport(false);
  };

  const workTypeMap: Record<string, string> = {
    '管道敷设': '管道敷设',
    '线缆穿放': '线缆穿放',
    '设备安装': '设备安装',
    '设备调试': '设备调试',
    '基础施工': '基础施工',
    '其他': '其他',
  };

  // Group by date for timeline view
  const groupedByDate = filteredReports.reduce((acc, report) => {
    if (!acc[report.date]) acc[report.date] = [];
    acc[report.date].push(report);
    return acc;
  }, {} as Record<string, Report[]>);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] pb-6">
      {/* Filters */}
      <div className="bg-white px-4 py-3 border-b border-gray-100 space-y-3">
        {/* 关键词搜索（桩号/施工内容/人员） */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              value={searchDraft}
              onChange={(e) => {
                setSearchDraft(e.target.value);
                if (!e.target.value) setSearchQuery('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              placeholder="搜索桩号 / 施工内容 / 人员"
              className="w-full pl-9 pr-8 py-2.5 bg-[#F5F6F8] rounded-lg text-sm text-[#1A1A2E] placeholder:text-gray-300"
            />
            {searchDraft && (
              <button
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 p-0.5"
                aria-label="清除搜索"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={applySearch}
            className="shrink-0 px-4 py-2.5 bg-[#1E5AA8] text-white rounded-lg text-sm font-medium"
          >
            搜索
          </button>
        </div>
        {/* 日期筛选 + 重置 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => { setPagination((current) => ({ ...current, page: 1 })); setFilterDate(e.target.value); }}
              className="w-full pl-9 pr-4 py-2.5 bg-[#F5F6F8] rounded-lg text-sm text-[#1A1A2E]"
            />
          </div>
          <button
            onClick={() => { setPagination((current) => ({ ...current, page: 1 })); setFilterDate(''); }}
            className="shrink-0 px-3 py-2.5 bg-[#F5F6F8] rounded-lg text-sm text-gray-500"
          >
            重置
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm ${
                viewMode === 'list' ? 'bg-[#1E5AA8] text-white' : 'bg-[#F5F6F8] text-gray-500'
              }`}
            >
              <List className="w-3.5 h-3.5" /> 列表
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm ${
                viewMode === 'timeline' ? 'bg-[#1E5AA8] text-white' : 'bg-[#F5F6F8] text-gray-500'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> 时间线
            </button>
          </div>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#16A34A] text-white rounded-lg text-sm font-medium"
          >
            <Download className="w-3.5 h-3.5" /> 导出
          </button>
        </div>
      </div>

      {/* Records */}
      <div className="px-4 py-3">
        {viewMode === 'list' ? (
          <>
          <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1180px] table-fixed text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="w-28 px-4 py-3">日期</th><th className="w-28 px-3 py-3">系统</th><th className="w-[420px] px-3 py-3">施工明细（内容 / 数量 / 位置）</th><th className="w-72 px-3 py-3">参与人员 / 考勤</th><th className="w-20 px-3 py-3">天气</th><th className="w-24 px-3 py-3">提交人</th><th className="w-36 px-4 py-3 text-right">操作</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{filteredReports.map((report) => {
              const workerIds = parseStringArray(report.workers); const workItems = parseWorkItems(report.work_items); const photos = parsePhotos(report.photos); const open = expandedId === report.id; const attendanceDetails = getAttendanceDetails(report);
              const detailItems = workItems.length > 0 ? workItems : [{ name: report.work_type, quantity: report.quantity, unit: report.unit, location: report.location }];
              return <Fragment key={report.id}><tr className="hover:bg-blue-50/30"><td className="whitespace-nowrap px-4 py-3 align-top font-medium text-gray-900">{report.date}</td><td className="px-3 py-3 align-top"><span className="rounded bg-[#E8F0FE] px-2 py-1 text-xs text-[#1E5AA8]">{report.system || workTypeMap[report.work_type] || report.work_type}</span></td><td className="px-3 py-3 align-top"><div className="space-y-2">{detailItems.map((item, index) => <div key={`${item.name}-${item.location || ''}-${index}`} className="rounded-lg border border-gray-100 bg-white px-3 py-2"><div className="break-words font-medium leading-5 text-gray-800">{item.name} <span className="whitespace-nowrap text-[#1E5AA8]">{item.quantity}{item.unit}</span></div><div className="mt-1 flex items-start gap-1 text-xs leading-5 text-gray-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" /><span className="break-all">{item.location || '未填写施工位置'}</span></div></div>)}</div></td><td className="px-3 py-3 align-top"><div className="space-y-2">{attendanceDetails.map((detail, index) => <div key={`${detail.name}-${index}`} className="rounded-lg bg-gray-50 px-2.5 py-2"><div className="break-words text-xs font-medium leading-5 text-gray-700">{detail.workerNames}</div><div className="mt-1 flex flex-wrap items-center gap-1"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${detail.attendanceLabel === '全天' ? 'bg-green-100 text-green-700' : detail.attendanceLabel === '半天' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'}`}>{detail.attendanceLabel}</span>{detail.overtimeHours > 0 && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-700">加班 {detail.overtimeHours}小时</span>}{attendanceDetails.length > 1 && <span className="truncate text-[11px] text-gray-400" title={detail.name}>{detail.name}</span>}</div></div>)}</div></td><td className="px-3 py-3 align-top text-gray-600">{report.weather || '—'}</td><td className="px-3 py-3 align-top text-gray-600">{getSubmitterName(report.submitter)}</td><td className="px-4 py-3 align-top"><div className="flex justify-end gap-1"><button onClick={() => setExpandedId(open ? null : report.id)} className="rounded-lg px-2 py-1.5 text-xs text-[#1E5AA8] hover:bg-blue-50">{open ? '收起' : '详情'}</button><button onClick={() => window.location.assign(`/report?edit=${encodeURIComponent(report.id)}`)} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-[#1E5AA8]" aria-label="修改记录"><Pencil className="h-4 w-4" /></button><button onClick={() => handleDeleteReport(report.id)} className="rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-50">删除</button></div></td></tr>
                {open && <tr><td colSpan={7} className="bg-gray-50 px-6 py-4"><div className="grid gap-4 lg:grid-cols-[1fr_280px]"><div><div className="text-xs font-medium text-gray-400">参与人员</div><div className="mt-1 text-sm text-gray-700">{workerIds.length > 0 ? workerIds.map(getWorkerName).join('、') : '未关联人员'}</div>{report.notes && <><div className="mt-3 text-xs font-medium text-gray-400">现场说明</div><div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{report.notes}</div></>}<div className="mt-3 text-xs text-gray-400">上传时间：{formatSubmittedAt(report.created_at)}</div></div><div><div className="text-xs font-medium text-gray-400">现场照片（{photos.length}张）</div>{photos.length > 0 ? <div className="mt-2 grid grid-cols-4 gap-2">{photos.slice(0, 8).map((photo, index) => <button key={`${photo.url}-${index}`} type="button" onClick={() => setPreviewPhoto(photo)}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt={photo.name || '现场照片'} className="aspect-square w-full rounded-lg object-cover" /></button>)}</div> : <div className="mt-2 text-sm text-gray-400">未上传照片</div>}</div></div></td></tr>}
              </Fragment>;
            })}</tbody>
          </table></div></div>
          <div className="space-y-3 md:hidden">
            {filteredReports.map((report) => {
              const workerIds = parseStringArray(report.workers);
              const qualityChecks = parseStringArray(report.quality_checks);
              const workItems = parseWorkItems(report.work_items);
              const photos = parsePhotos(report.photos);
              const photoCount = photos.length;
              const isExpanded = expandedId === report.id;

              return (
                <div
                  key={report.id}
                  className="bg-white rounded-xl p-4 shadow-sm"
                >
                  <div
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : report.id)}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-[#1A1A2E]">{report.date}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-[#E8F0FE] text-[#1E5AA8] rounded">
                          {report.system || workTypeMap[report.work_type] || report.work_type}
                        </span>
                        {workItems.length > 1 && (
                          <span className="text-xs text-gray-400">共{workItems.length}项</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {(workItems.length > 0 ? workItems : [{
                          name: report.work_type,
                          unit: report.unit,
                          quantity: report.quantity,
                          location: report.location,
                        }]).map((item, i) => (
                          <div key={i} className="min-w-0 rounded-lg bg-[#F7F9FC] px-3 py-2">
                            <div className="flex min-w-0 items-start gap-2 text-sm">
                              <div className="min-w-0 flex-1 font-medium text-[#1A1A2E] break-words">
                                {item.name}
                              </div>
                              <div className="shrink-0 font-medium text-[#1E5AA8]">
                                {item.quantity}{item.unit}
                              </div>
                            </div>
                            <div className="mt-1 flex min-w-0 items-start gap-1 text-xs leading-5 text-gray-500">
                              <MapPin className="mt-1 h-3 w-3 shrink-0" />
                              <span className="min-w-0 break-all">{item.location || report.location}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {workerIds.length}人
                        </span>
                        <span className="flex items-center gap-1">
                          <Camera className="w-3 h-3" /> {photoCount}张
                        </span>
                        <span className="break-all">提交于 {formatSubmittedAt(report.created_at)}</span>
                      </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="mb-3">
                        <div className="mb-2 text-xs font-medium text-gray-400">考勤记录</div>
                        <div className="space-y-2">
                          {(workItems.length > 0 ? workItems : [{
                            name: report.work_type,
                            unit: report.unit,
                            quantity: report.quantity,
                            attendance: 'full' as const,
                            overtimeHours: 0,
                            workers: workerIds,
                          }]).map((item, i) => {
                            const itemWorkerIds = item.workers && item.workers.length > 0 ? item.workers : workerIds;
                            const attendanceLabel = item.attendance === 'half' ? '半天' : item.attendance === 'none' ? '仅计量' : '全天';
                            return (
                              <div key={i} className="rounded-lg border border-gray-100 px-3 py-2.5 text-sm">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="min-w-0 font-medium text-[#1A1A2E] break-words">{item.name}</span>
                                  <span className="rounded bg-[#E8F0FE] px-1.5 py-0.5 text-[10px] text-[#1E5AA8]">{attendanceLabel}</span>
                                  {(item.overtimeHours || 0) > 0 && (
                                    <span className="rounded bg-[#FFF3E8] px-1.5 py-0.5 text-[10px] text-[#E8740C]">加班{item.overtimeHours}h</span>
                                  )}
                                  {item.external && (
                                    <span className="rounded bg-[#F3E8FF] px-1.5 py-0.5 text-[10px] text-[#7C3AED]">合同外</span>
                                  )}
                                </div>
                                <div className="mt-1 text-xs leading-5 text-gray-500 break-words">
                                  {itemWorkerIds.length > 0 ? itemWorkerIds.map(getWorkerName).join('、') : '未关联人员'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="mb-3">
                        <div className="mb-2 text-xs font-medium text-gray-400">现场照片（{photoCount}张）</div>
                        {photos.length > 0 ? (
                          <div className="grid grid-cols-3 gap-2">
                            {photos.map((photo, i) => (
                              <button key={`${photo.url}-${i}`} type="button" onClick={() => setPreviewPhoto(photo)} className="block min-w-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={photo.url} alt={photo.name || `现场照片${i + 1}`} className="aspect-square w-full rounded-lg bg-gray-100 object-cover" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg bg-[#F7F9FC] px-3 py-2.5 text-sm text-gray-400">未上传照片</div>
                        )}
                      </div>
                      {report.device_point && (
                        <div className="text-sm text-gray-500 mb-2 break-all">
                          设备点位: {report.device_point}
                        </div>
                      )}
                      {report.weather && (
                        <div className="text-sm text-gray-500 mb-2">
                          天气: {report.weather}
                        </div>
                      )}
                      {qualityChecks.length > 0 && (
                        <div className="mb-2">
                          <div className="text-xs text-gray-400 mb-1">质量检查:</div>
                          <div className="flex flex-wrap gap-1">
                            {qualityChecks.map((check) => (
                              <span key={check} className="text-xs px-2 py-0.5 bg-[#E8F8EE] text-[#16A34A] rounded">
                                {check}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {report.issue && (
                        <div className="mt-2 p-2 bg-[#FFF8F0] rounded-lg">
                          <div className="text-xs text-[#E8740C] mb-0.5">异常记录:</div>
                          <div className="text-sm text-[#E8740C] break-words">{report.issue}</div>
                        </div>
                      )}
                      {report.notes && (
                        <div className="mt-2 p-2 bg-[#F5F6F8] rounded-lg">
                          <div className="text-xs text-gray-400 mb-0.5">备注:</div>
                          <div className="text-sm text-gray-600 break-words">{report.notes}</div>
                        </div>
                      )}
                      <div className="mt-3 rounded-lg border border-gray-100 px-3 py-2 text-xs leading-5 text-gray-400 break-words">
                        提交人：{getSubmitterName(report.submitter)}<br />
                        上传时间：{formatSubmittedAt(report.created_at)}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => window.location.assign(`/report?edit=${encodeURIComponent(report.id)}`)}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-[#BCD0EB] py-2.5 text-sm font-medium text-[#1E5AA8] hover:bg-[#F5F9FF]">
                          <Pencil className="h-3.5 w-3.5" /> 修改记录
                        </button>
                        <button type="button" onClick={() => handleDeleteReport(report.id)}
                          className="rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50">
                          删除记录
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#CFE0F5] bg-[#F4F8FD] px-3.5 py-3">
              <div className="text-sm font-medium text-[#1E5AA8]">每日施工轨迹</div>
              <div className="mt-0.5 text-xs leading-5 text-gray-500">按施工日期和提交时间，快速回顾每天完成了哪些工作。</div>
            </div>
            {Object.entries(groupedByDate)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, dateReports]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-[#1E5AA8]" />
                    <span className="text-sm font-medium text-[#1A1A2E]">{date}</span>
                    <span className="text-xs text-gray-400">{dateReports.length}条记录</span>
                  </div>
                  <div className="ml-2 border-l-2 border-[#1E5AA8]/20 pl-4 space-y-3">
                    {dateReports.map((report) => {
                      const workerIds = parseStringArray(report.workers);
                      const workItems = parseWorkItems(report.work_items);
                      const timelineItems = workItems.length > 0 ? workItems : [{
                        name: report.work_type,
                        unit: report.unit,
                        quantity: report.quantity,
                        location: report.location,
                      }];
                      const photoCount = parsePhotos(report.photos).length;
                      return (
                        <div key={report.id} className="relative">
                          <div className="absolute -left-[22px] top-3 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#1E5AA8] shadow-sm" />
                          <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
                            <div className="mb-2.5 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-[#1E5AA8]">
                                {formatSubmittedTime(report.created_at)}
                              </span>
                              <span className="rounded bg-[#E8F0FE] px-1.5 py-0.5 text-xs text-[#1E5AA8]">
                                {report.system || workTypeMap[report.work_type] || report.work_type}
                              </span>
                              {timelineItems.length > 1 && (
                                <span className="text-xs text-gray-400">{timelineItems.length}项施工</span>
                              )}
                            </div>
                            <div className="space-y-2.5">
                              {timelineItems.map((item, index) => (
                                <div key={index} className="min-w-0">
                                  <div className="flex min-w-0 items-start gap-2">
                                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#1E5AA8]" />
                                    <span className="min-w-0 flex-1 text-sm font-medium leading-5 text-[#1A1A2E] break-words">
                                      {item.name}
                                    </span>
                                    <span className="shrink-0 text-sm font-semibold text-[#1E5AA8]">
                                      {item.quantity}{item.unit}
                                    </span>
                                  </div>
                                  <div className="ml-3 mt-1 flex min-w-0 items-start gap-1 text-xs leading-5 text-gray-500">
                                    <MapPin className="mt-1 h-3 w-3 shrink-0" />
                                    <span className="min-w-0 break-all">{item.location || report.location}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2.5 text-xs text-gray-400">
                              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{workerIds.length}人</span>
                              <span className="flex items-center gap-1"><Camera className="h-3 w-3" />{photoCount}张</span>
                              <span>提交人：{getSubmitterName(report.submitter)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}

        {filteredReports.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">暂无施工记录</p>
          </div>
        )}
        {pagination.total > 0 && <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm text-gray-500 shadow-sm sm:flex-row">
          <span>共 {pagination.total} 条，第 {pagination.page}/{pagination.totalPages} 页</span>
          <div className="flex items-center gap-2"><label className="flex items-center gap-1 text-xs">每页<select value={pagination.pageSize} onChange={(event) => setPagination((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))} className="rounded-lg border px-2 py-1.5"><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>条</label><button type="button" disabled={pagination.page <= 1} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">上一页</button><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg bg-[#1E5AA8] px-3 py-1.5 text-white disabled:opacity-40">下一页</button></div>
        </div>}
      </div>

      {previewPhoto && <PhotoViewer photo={previewPhoto} onClose={() => setPreviewPhoto(null)} />}

      {showExport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-white rounded-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold">导出数据</h2>
              <button onClick={() => setShowExport(false)} className="p-1">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* 导出类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">导出类型</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setExportType('reports')}
                    className={`py-3 rounded-xl text-sm font-medium border ${
                      exportType === 'reports'
                        ? 'bg-[#1E5AA8] text-white border-[#1E5AA8]'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    施工记录
                  </button>
                  <button
                    onClick={() => setExportType('attendance')}
                    className={`py-3 rounded-xl text-sm font-medium border ${
                      exportType === 'attendance'
                        ? 'bg-[#1E5AA8] text-white border-[#1E5AA8]'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    考勤记录
                  </button>
                </div>
              </div>

              {exportType === 'reports' ? (
                <>
                  {/* 范围快捷选择 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">时间范围</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { key: 'current', label: '当前筛选' },
                        { key: 'month', label: '本月' },
                        { key: 'lastMonth', label: '上月' },
                        { key: 'custom', label: '自定义' },
                      ].map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setReportRange(opt.key as typeof reportRange)}
                          className={`py-2.5 rounded-lg text-xs font-medium border ${
                            reportRange === opt.key
                              ? 'bg-[#E8F0FE] text-[#1E5AA8] border-[#1E5AA8]'
                              : 'bg-white text-gray-600 border-gray-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {reportRange === 'month' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">选择月份</label>
                      <input
                        type="month"
                        value={exportMonth}
                        onChange={(e) => setExportMonth(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                      />
                    </div>
                  )}

                  {reportRange === 'custom' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">开始日期</label>
                        <input
                          type="date"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">结束日期</label>
                        <input
                          type="date"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                        />
                      </div>
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                    {reportRange === 'current'
                      ? '将导出当前筛选结果（含关键词 + 日期筛选）'
                      : reportRange === 'custom'
                      ? `将导出 ${customStart || '?'} ~ ${customEnd || '?'} 的施工记录`
                      : reportRange === 'month'
                      ? `将导出 ${exportMonth} 月份的施工记录`
                      : '将导出上月的施工记录'}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">考勤月份</label>
                    <input
                      type="month"
                      value={exportMonth}
                      onChange={(e) => setExportMonth(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                    />
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                    考勤按报工中的「参与人员」自动统计，导出每人出勤天数及具体日期。
                  </div>
                </>
              )}

              <button
                onClick={exportType === 'reports' ? doExportReports : doExportAttendance}
                className="w-full py-3.5 bg-[#16A34A] text-white rounded-xl font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                导出 Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
