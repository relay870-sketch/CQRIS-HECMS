import type { Metadata } from 'next';
import Image from 'next/image';
import { chinaDate, getPublicBoardData } from '@/lib/public-board';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '公开施工看板｜重庆瑞思施工管理系统', description: '今日施工内容、人员出勤、加班及历史施工记录公开只读看板' };

export default async function PublicBoardPage({ searchParams }: { searchParams: Promise<{ date?: string; projectId?: string }> }) {
  const params = await searchParams;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : chinaDate();
  const projectId = params.projectId || '';
  const data = getPublicBoardData(date, projectId);
  const jsonQuery = new URLSearchParams({ date });
  if (projectId) jsonQuery.set('projectId', projectId);

  return <div className="min-h-screen bg-[#F3F5F8] text-[#172033]">
    <header className="border-b border-blue-900/20 bg-[#174F91] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3"><Image src="/chongqing-ruisi-logo.png" alt="重庆瑞思 Logo" width={42} height={42} priority className="h-10 w-10 object-contain" /><div><h1 className="text-lg font-bold sm:text-xl">重庆瑞思公开施工看板</h1><p className="mt-0.5 text-xs text-blue-100">公开只读 · 中国标准时间 · 每次访问实时生成</p></div></div>
        <a href={`/api/public/board?${jsonQuery.toString()}`} className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm hover:bg-white/20">获取 JSON 数据</a>
      </div>
    </header>

    <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6">
      <section aria-labelledby="filters" className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="filters" className="font-semibold">统计范围</h2><p className="mt-1 text-xs text-gray-400">OpenClaw 可通过日期和项目参数生成指定日报</p></div>
          <form method="get" action="/board" className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-gray-500">日期<input type="date" name="date" defaultValue={date} className="mt-1 block h-10 rounded-lg border border-gray-200 px-2.5 text-sm text-gray-800" /></label>
            <label className="text-xs text-gray-500">项目<select name="projectId" defaultValue={projectId} className="mt-1 block h-10 max-w-[220px] rounded-lg border border-gray-200 px-2.5 text-sm text-gray-800"><option value="">全部项目</option>{data.availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <button className="h-10 rounded-lg bg-[#1E5AA8] px-4 text-sm font-medium text-white">查询</button>
          </form>
        </div>
      </section>

      <section aria-labelledby="summary-title">
        <div className="mb-2 flex items-center justify-between"><h2 id="summary-title" className="font-semibold"><time dateTime={date}>{date}</time> 施工概览</h2><span className="text-xs text-gray-400">更新时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</span></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {[
            ['施工项目', data.summary.projectCount, '个'], ['报工记录', data.summary.reportCount, '条'], ['施工内容', data.summary.workItemCount, '项'],
            ['出勤人数', data.summary.attendanceCount, '人'], ['累计加班', data.summary.overtimePersonHours, '人时'], ['合同外施工', data.summary.contractOutsideCount, '项'], ['现场照片', data.summary.photoCount, '张'],
          ].map(([label, value, unit]) => <div key={String(label)} className="rounded-xl bg-white p-3 shadow-sm"><div className="text-xs text-gray-400">{label}</div><div className="mt-1 text-xl font-bold text-[#1E5AA8]" data-field={String(label)}>{value}<span className="ml-1 text-xs font-normal text-gray-400">{unit}</span></div></div>)}
        </div>
      </section>

      <section aria-labelledby="today-title" className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 id="today-title" className="font-semibold">当日施工明细</h2><p className="mt-1 text-xs text-gray-400">人员：{data.summary.attendanceNames.length > 0 ? data.summary.attendanceNames.join('、') : '无出勤记录'}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-[#1E5AA8]">共 {data.summary.workItemCount} 项</span></div>
        {data.targetRecords.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">该日期暂无施工记录</div> : <div className="mt-4 space-y-4">
          {data.targetRecords.map((record) => <article key={record.id} className="rounded-xl border border-gray-100 p-3.5" data-report-id={record.id}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{record.projectName}</h3><p className="mt-1 text-xs text-gray-400">{record.system} · 天气 {record.weather} · 提交人 {record.submitter}</p></div><div className="text-xs text-gray-400">照片 {record.photoCount} 张</div></div>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-400"><tr><th className="px-2 py-2">施工位置</th><th className="px-2 py-2">施工内容</th><th className="px-2 py-2">数量</th><th className="px-2 py-2">人员</th><th className="px-2 py-2">考勤/加班</th><th className="px-2 py-2">性质</th></tr></thead><tbody>{record.items.map((item, index) => <tr key={`${record.id}-${index}`} className="border-t border-gray-100"><td className="px-2 py-2">{item.location}</td><td className="px-2 py-2 font-medium">{item.name}</td><td className="px-2 py-2">{item.quantity} {item.unit}</td><td className="px-2 py-2">{item.workers.join('、') || '无'}</td><td className="px-2 py-2">{item.attendance}{item.overtimeHours > 0 ? ` / 加班${item.overtimeHours}小时` : ''}</td><td className="px-2 py-2">{item.contractOutside ? '合同外' : '合同内'}</td></tr>)}</tbody></table></div>
            {record.siteNotes && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><span className="font-medium">现场说明：</span>{record.siteNotes}</div>}
          </article>)}
        </div>}
      </section>

      <section aria-labelledby="history-title" className="rounded-2xl bg-white p-4 shadow-sm">
        <div><h2 id="history-title" className="font-semibold">历史施工记录</h2><p className="mt-1 text-xs text-gray-400">按日期倒序，最多展示最近 100 条；详细结构可读取 JSON 接口</p></div>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-400"><tr><th className="px-3 py-2">日期</th><th className="px-3 py-2">项目/系统</th><th className="px-3 py-2">位置</th><th className="px-3 py-2">施工内容与数量</th><th className="px-3 py-2">人员</th><th className="px-3 py-2">天气</th><th className="px-3 py-2">加班</th><th className="px-3 py-2">现场说明</th></tr></thead><tbody>{data.history.map((record) => <tr key={record.id} className="border-t border-gray-100 align-top"><td className="whitespace-nowrap px-3 py-2.5"><time dateTime={record.date}>{record.date}</time></td><td className="px-3 py-2.5"><div className="font-medium">{record.projectName}</div><div className="text-xs text-gray-400">{record.system}</div></td><td className="px-3 py-2.5">{record.locations.join('、')}</td><td className="px-3 py-2.5">{record.items.map((item) => `${item.name} ${item.quantity}${item.unit}`).join('；')}</td><td className="px-3 py-2.5">{record.workerNames.join('、') || '无'}</td><td className="px-3 py-2.5">{record.weather}</td><td className="px-3 py-2.5">{record.overtimePersonHours > 0 ? `${record.overtimePersonHours}人时` : '无'}</td><td className="max-w-[260px] px-3 py-2.5">{record.siteNotes || '无'}</td></tr>)}</tbody></table></div>
      </section>

      <footer className="pb-4 text-center text-xs leading-5 text-gray-400">{data.privacy}<br />机器读取接口：<code>/api/public/board?date=YYYY-MM-DD&amp;projectId=项目ID</code></footer>
    </main>
  </div>;
}
