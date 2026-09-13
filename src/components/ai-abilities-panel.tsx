'use client';
import { AlertTriangle, BookOpen, CalendarDays, ClipboardCheck, Clock3, TrendingUp } from 'lucide-react';

export interface AbilityValues { dailyReport: boolean; attendanceAnalysis: boolean; progressAnalysis: boolean; anomalyAnalysis: boolean; reportReview: boolean; knowledgeQa: boolean }
const items = [
  { key: 'dailyReport', name: '施工日报', description: '查询施工记录并生成日报、周报', icon: CalendarDays },
  { key: 'attendanceAnalysis', name: '考勤分析', description: '统计人数、人天、半天和加班', icon: Clock3 },
  { key: 'progressAnalysis', name: '进度分析', description: '读取清单、合同额和完成进度', icon: TrendingUp },
  { key: 'anomalyAnalysis', name: '异常检查', description: '检查漏报、合同外施工和超量项', icon: AlertTriangle },
  { key: 'reportReview', name: 'AI填报检查', description: '提交前分析文字清晰度和现场风险', icon: ClipboardCheck },
  { key: 'knowledgeQa', name: '资料库问答', description: '检索上传的规范和项目资料', icon: BookOpen },
] as const;

export function AiAbilitiesPanel({ value, onChange, onSave, saving }: { value: AbilityValues; onChange: (value: AbilityValues) => void; onSave: () => void; saving: boolean }) {
  return <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="font-semibold">AI 能力模块</h2><p className="mt-1 text-xs text-gray-400">关闭模块后，AI 不再读取或分析对应数据。</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{items.map((item) => { const Icon = item.icon; return <label key={item.key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-100 p-3"><span className="rounded-lg bg-[#E8F0FE] p-2 text-[#1E5AA8]"><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><b className="block text-sm">{item.name}</b><small className="text-xs text-gray-400">{item.description}</small></span><input type="checkbox" checked={value[item.key]} onChange={(event) => onChange({ ...value, [item.key]: event.target.checked })} className="h-4 w-4 accent-[#1E5AA8]"/></label>; })}</div><div className="mt-4 flex justify-end"><button type="button" onClick={onSave} disabled={saving} className="rounded-lg bg-[#1E5AA8] px-4 py-2 text-sm text-white disabled:opacity-40">保存能力设置</button></div></section>;
}
