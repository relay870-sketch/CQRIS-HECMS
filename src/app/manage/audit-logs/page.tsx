'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { ArrowLeft, ChevronDown, Download, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { formatStoredAuditData } from '@/lib/audit-format';

interface AuditLog {
  id: string; project_id: string | null; module: string; action: string; entity_type: string;
  entity_id: string | null; detail: string; operator: string; result: string; ip_address: string | null;
  user_agent: string | null; before_data: string | null; after_data: string | null; created_at: string;
  device_type: string | null; browser: string | null;
}

interface AuditSummary { failed24h: number; loginFailed30m: number; deletes24h: number; riskLevel: 'normal' | 'medium' | 'high' }

const moduleNames: Record<string, string> = { auth: '账号登录', accounts: '账号管理', reports: '施工报工', attendance: '考勤管理', projects: '项目管理', workers: '人员管理', bom: '工程量清单', locations: '桩号管理', documents: '资料库', systems: '子系统管理', system: '系统' };
const actionNames: Record<string, string> = { create: '新增', update: '修改', delete: '删除', login: '登录', logout: '退出', login_failed: '登录失败', blocked_login: '拦截登录', block_ip: '封禁IP', unblock_ip: '解除IP', review: '审核', import: '导入', upload: '上传', manual_update: '人工修正', backup: '数据备份', restore: '数据恢复', ai_query: 'AI查询' };

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [keyword, setKeyword] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scope, setScope] = useState<'current' | 'archive'>('current');
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const query = useMemo(() => new URLSearchParams({ scope, ...(module && { module }), ...(action && { action }), ...(result && { result }), ...(projectId && { projectId }), ...(keyword && { keyword }), ...(start && { start }), ...(end && { end }) }).toString(), [action, end, keyword, module, projectId, result, scope, start]);
  const load = async () => {
    setLoading(true);
    try { const response = await fetch(`/api/audit-logs?${query}`); const data: unknown = await response.json(); setLogs(Array.isArray(data) ? data as AuditLog[] : []); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [query]);
  useEffect(() => { fetch('/api/projects').then((response) => response.json()).then((data: unknown) => setProjects(Array.isArray(data) ? data as Array<{ id: string; name: string }> : [])).catch(() => setProjects([])); }, []);
  useEffect(() => { fetch('/api/audit-logs?summary=1').then((response) => response.json()).then((data: AuditSummary) => setSummary(data)).catch(() => setSummary(null)); }, []);
  const activeFilterCount = [projectId, module, action, result, keyword, start, end].filter(Boolean).length;
  const clearFilters = () => { setProjectId(''); setModule(''); setAction(''); setResult(''); setKeyword(''); setStart(''); setEnd(''); };

  const exportLogs = () => {
    const rows = logs.map((log) => ({ 时间: log.created_at, 操作人: log.operator, 模块: moduleNames[log.module] || log.module,
      操作: actionNames[log.action] || log.action, 对象: log.entity_type, 摘要: log.detail,
      结果: log.result === 'success' ? '成功' : '失败', IP: log.ip_address || '' }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), '操作日志');
    XLSX.writeFile(book, `系统操作日志_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  };

  const supplementaryDetails = (stored: string | null, log: AuditLog): string => {
    const formatted = formatStoredAuditData(stored);
    if (!formatted) return '';
    const visibleSummary = `${log.operator} ${log.detail}`.replaceAll(' ', '');
    return formatted.split('\n').filter((line) => {
      const separator = line.indexOf('：');
      if (separator < 0) return true;
      const value = line.slice(separator + 1).trim().replaceAll(' ', '');
      return !value || value === '无' || !visibleSummary.includes(value);
    }).join('\n').trim();
  };

  return <div className="min-h-screen bg-[#F5F6F8] pb-8">
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white px-3 py-3">
      <Link href="/profile" className="rounded-lg p-2"><ArrowLeft className="h-5 w-5" /></Link>
      <div className="flex-1"><h1 className="font-semibold">系统操作日志</h1><p className="text-xs text-gray-400">重要数据操作与修改记录</p></div>
      <button onClick={exportLogs} className="flex items-center gap-1 rounded-lg bg-[#1E5AA8] px-3 py-2 text-xs text-white"><Download className="h-3.5 w-3.5" />导出</button>
    </header>
    <main className="mx-auto max-w-5xl space-y-3 p-4">
      {summary && <section className={`rounded-xl border p-3 ${summary.riskLevel === 'high' ? 'border-red-200 bg-red-50' : summary.riskLevel === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
        <div className="text-sm font-semibold">安全与异常提醒</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center"><div><b className="text-lg">{summary.failed24h}</b><p className="text-[11px] text-gray-500">24小时失败</p></div><div><b className="text-lg">{summary.loginFailed30m}</b><p className="text-[11px] text-gray-500">30分钟登录失败</p></div><div><b className="text-lg">{summary.deletes24h}</b><p className="text-[11px] text-gray-500">24小时删除</p></div></div>
        {summary.riskLevel !== 'normal' && <p className="mt-2 text-xs text-gray-600">检测到较多失败或删除操作，请结合下方日志确认是否正常。</p>}
      </section>}
      <div className="grid grid-cols-2 rounded-xl bg-gray-200 p-1 text-sm"><button onClick={() => setScope('current')} className={`rounded-lg py-2 ${scope === 'current' ? 'bg-white font-medium text-[#1E5AA8] shadow-sm' : 'text-gray-500'}`}>近一年日志</button><button onClick={() => setScope('archive')} className={`rounded-lg py-2 ${scope === 'archive' ? 'bg-white font-medium text-[#1E5AA8] shadow-sm' : 'text-gray-500'}`}>历史归档</button></div>
      <section className="overflow-hidden rounded-xl bg-white shadow-sm">
        <button type="button" onClick={() => setShowFilters((value) => !value)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
          <SlidersHorizontal className="h-4 w-4 text-[#1E5AA8]"/><span className="flex-1 text-sm font-medium">筛选查询</span>
          {activeFilterCount > 0 && <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-xs text-[#1E5AA8]">已选 {activeFilterCount} 项</span>}
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showFilters ? 'rotate-180' : ''}`}/>
        </button>
        {showFilters && <div className="border-t border-gray-100 p-4">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="min-w-0 sm:col-span-2"><span className="mb-1 block text-xs text-gray-500">关键词</span><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="操作人、对象或内容" className="h-9 w-full min-w-0 rounded-lg border pl-9 pr-2 text-sm"/></div></label>
            <label className="min-w-0"><span className="mb-1 block text-xs text-gray-500">所属项目</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border px-2 text-sm"><option value="">全部项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label className="min-w-0"><span className="mb-1 block text-xs text-gray-500">功能模块</span><select value={module} onChange={(event) => setModule(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border px-2 text-sm"><option value="">全部模块</option>{Object.entries(moduleNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
            <label className="min-w-0"><span className="mb-1 block text-xs text-gray-500">操作类型</span><select value={action} onChange={(event) => setAction(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border px-2 text-sm"><option value="">全部操作</option>{Object.entries(actionNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
            <label className="min-w-0"><span className="mb-1 block text-xs text-gray-500">操作结果</span><select value={result} onChange={(event) => setResult(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border px-2 text-sm"><option value="">全部结果</option><option value="success">成功</option><option value="failure">失败</option></select></label>
            <label className="min-w-0"><span className="mb-1 block text-xs text-gray-500">开始日期</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border px-2 text-sm" /></label>
            <label className="min-w-0"><span className="mb-1 block text-xs text-gray-500">结束日期</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border px-2 text-sm" /></label>
          </div>
          <div className="mt-3 flex justify-end"><button type="button" onClick={clearFilters} disabled={activeFilterCount === 0} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"><X className="h-3.5 w-3.5"/>清空筛选</button></div>
        </div>}
      </section>
      {loading ? <div className="py-16 text-center text-sm text-gray-400">加载中…</div> : logs.length === 0 ? <div className="py-16 text-center text-sm text-gray-400">暂无操作日志</div> : <>
        <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block"><div className="overflow-x-auto"><table className="w-full min-w-[960px] table-fixed text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="w-40 px-4 py-3">时间</th><th className="w-24 px-3 py-3">操作人</th><th className="w-28 px-3 py-3">模块</th><th className="w-24 px-3 py-3">操作</th><th className="px-3 py-3">摘要</th><th className="w-20 px-3 py-3">结果</th><th className="w-20 px-4 py-3 text-right">详情</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{logs.map((log) => {
            const beforeDetails = supplementaryDetails(log.before_data, log); const afterDetails = supplementaryDetails(log.after_data, log);
            return <Fragment key={log.id}><tr className="hover:bg-blue-50/30"><td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{log.created_at}</td><td className="px-3 py-3 font-medium text-gray-900">{log.operator}</td><td className="px-3 py-3"><span className="rounded bg-gray-100 px-2 py-1 text-xs">{moduleNames[log.module] || log.module}</span></td><td className="px-3 py-3 text-gray-600">{actionNames[log.action] || log.action}</td><td className="truncate px-3 py-3 text-gray-600" title={log.detail}>{log.detail}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${log.result === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{log.result === 'success' ? '成功' : '失败'}</span></td><td className="px-4 py-3 text-right"><button onClick={() => setExpanded(expanded === log.id ? null : log.id)} className="rounded-lg px-2 py-1 text-xs text-[#1E5AA8] hover:bg-blue-50">{expanded === log.id ? '收起' : '查看'}</button></td></tr>
              {expanded === log.id && <tr><td colSpan={7} className="bg-gray-50 px-6 py-4"><div className="grid gap-3 lg:grid-cols-2">{beforeDetails && <div><b className="text-xs">修改前</b><div className="mt-1 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-5 text-gray-600">{beforeDetails}</div></div>}{afterDetails && <div><b className="text-xs">修改后</b><div className="mt-1 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-5 text-gray-600">{afterDetails}</div></div>}</div><div className="mt-2 text-xs text-gray-400">IP：{log.ip_address || '—'} · {log.device_type || '未知设备'} · {log.browser || '未知浏览器'}</div></td></tr>}
            </Fragment>;
          })}</tbody>
        </table></div></div>
        <div className="space-y-2 md:hidden">{logs.map((log) => {
          const beforeDetails = supplementaryDetails(log.before_data, log);
          const afterDetails = supplementaryDetails(log.after_data, log);
          return <article key={log.id} className="rounded-xl bg-white shadow-sm">
          <button onClick={() => setExpanded(expanded === log.id ? null : log.id)} className="flex w-full items-start gap-3 p-3.5 text-left">
            <div className={`mt-0.5 rounded-lg p-2 ${log.result === 'success' ? 'bg-[#E8F0FE] text-[#1E5AA8]' : 'bg-red-50 text-red-500'}`}><ShieldCheck className="h-4 w-4"/></div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5 text-sm"><b>{log.operator}</b><span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{moduleNames[log.module] || log.module}</span><span className="text-gray-500">{actionNames[log.action] || log.action}</span></div><p className="mt-1 break-words text-sm text-gray-600">{log.detail}</p><p className="mt-1 text-xs text-gray-400">{log.created_at}</p></div><ChevronDown className={`h-4 w-4 text-gray-300 transition ${expanded === log.id ? 'rotate-180' : ''}`}/>
          </button>
          {expanded === log.id && <div className="space-y-2 border-t px-4 py-3 text-xs text-gray-600">
            {beforeDetails && <div><b>修改前</b><div className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-2 leading-5">{beforeDetails}</div></div>}
            {afterDetails && <div><b>修改后</b><div className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-2 leading-5">{afterDetails}</div></div>}
            <div className="text-gray-400">结果：{log.result === 'success' ? '成功' : '失败'}{log.ip_address ? ` · IP：${log.ip_address}` : ''}{log.device_type ? ` · ${log.device_type}` : ''}{log.browser ? ` · ${log.browser}` : ''}</div>
          </div>}
        </article>;})}</div></>}
    </main>
  </div>;
}
