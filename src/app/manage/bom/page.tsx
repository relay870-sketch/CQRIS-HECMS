'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Edit2, Trash2, X, Check, Upload, Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { ManagePageHeader } from '@/components/manage-page-header';

interface BomItem {
  id: string;
  project_id: string;
  code: string;
  name: string;
  unit: string;
  total_qty: number;
  completed_qty: number;
  unit_price: number;
  system?: string | null;
}

interface Project {
  id: string;
  name: string;
}

interface ImportItem {
  code: string;
  name: string;
  unit: string;
  total_qty: number;
  unit_price: number;
  completed_qty: number;
  system: string;
}

interface Adjustment { id: string; before_qty: number; after_qty: number; delta_qty: number; reason: string; operator: string; created_at: string }

function BomManagement() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');

  const [project, setProject] = useState<Project | null>(null);
  const [bomItems, setBomItems] = useState<BomItem[]>([]);
  const [systems, setSystems] = useState<string[]>([]);
  const [systemFilter, setSystemFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unfinished' | 'completed' | 'unpriced'>('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<BomItem | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    unit: '米',
    total_qty: '',
    completed_qty: '',
    unit_price: '',
    adjustment_reason: '',
    system: '',
  });
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportItem[]>([]);
  const [importSystem, setImportSystem] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectId) {
      fetchProject();
      fetchBomItems();
      fetchSystems();
    }
  }, [projectId]);

  const fetchSystems = async () => {
    try {
      const res = await fetch(`/api/systems?projectId=${projectId}`);
      const data = await res.json();
      setSystems(Array.isArray(data) ? data.map((s: { name: string }) => s.name) : []);
    } catch (error) {
      console.error('获取子系统失败:', error);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchBomItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemFilter]);

  // 弹窗打开时锁定背景滚动
  useEffect(() => {
    if (showForm || showImport) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showForm, showImport]);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects?id=${projectId}`);
      const data = await res.json();
      setProject(data);
    } catch (error) {
      console.error('获取项目信息失败:', error);
    }
  };

  const fetchBomItems = async () => {
    try {
      const sysParam = systemFilter ? `&system=${encodeURIComponent(systemFilter)}` : '';
      const res = await fetch(`/api/bom?projectId=${projectId}${sysParam}`);
      const data = await res.json();
      setBomItems(data);
    } catch (error) {
      console.error('获取清单失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateForm = () => {
    setEditingItem(null);
    setFormData({ code: '', name: '', unit: '米', total_qty: '', completed_qty: '', unit_price: '', adjustment_reason: '', system: systemFilter || '' });
    setShowForm(true);
  };

  const openEditForm = async (item: BomItem) => {
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      unit: item.unit,
      total_qty: item.total_qty.toString(),
      completed_qty: item.completed_qty.toString(),
      unit_price: (item.unit_price || 0).toString(),
      adjustment_reason: '',
      system: (item as BomItem & { system?: string }).system || '',
    });
    setShowForm(true);
    try {
      const response = await fetch(`/api/bom?adjustmentsFor=${encodeURIComponent(item.id)}`);
      const data: unknown = await response.json();
      setAdjustments(Array.isArray(data) ? data as Adjustment[] : []);
    } catch { setAdjustments([]); }
  };

  const handleSubmit = async () => {
    if (!formData.code || !formData.name || !formData.total_qty) {
      toast.error('请填写完整信息');
      return;
    }

    const totalQty = Number(formData.total_qty);
    const completedQty = Number(formData.completed_qty);
    if (!Number.isFinite(totalQty) || totalQty <= 0) {
      toast.error('总工程量必须大于 0');
      return;
    }
    if (editingItem && (!Number.isFinite(completedQty) || completedQty < 0 || completedQty > totalQty)) {
      toast.error(`已完成数量应在 0～${totalQty} ${formData.unit}之间`);
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        const res = await fetch('/api/bom', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingItem.id,
            ...formData,
            total_qty: totalQty,
            completed_qty: completedQty,
            unit_price: Number(formData.unit_price) || 0,
            adjustment_reason: formData.adjustment_reason,
          }),
        });
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || '更新失败');
        }
      } else {
        const res = await fetch('/api/bom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            ...formData,
            total_qty: totalQty,
            unit_price: Number(formData.unit_price) || 0,
          }),
        });
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || '创建失败');
        }
      }
      setShowForm(false);
      toast.success(editingItem ? '子目已更新' : '子目已添加');
      fetchBomItems();
    } catch (error) {
      console.error('保存失败:', error);
      toast.error(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: BomItem) => {
    if (!confirm(`确定删除清单项"${item.name}"吗？`)) {
      return;
    }

    try {
      const res = await fetch(`/api/bom?id=${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      fetchBomItems();
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败，请重试');
    }
  };

  // 批量导入相关函数
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);

      // 解析数据，支持多种列名格式
      const items = data.map((row): ImportItem => ({
        code: String(row['编号'] || row['code'] || row['Code'] || ''),
        name: String(row['名称'] || row['子目名称'] || row['name'] || row['Name'] || ''),
        unit: String(row['单位'] || row['unit'] || row['Unit'] || '米'),
        total_qty: Number(row['数量'] || row['总工程量'] || row['total_qty'] || row['Total Qty'] || row['工程量'] || 0),
        unit_price: Number(row['单价'] || row['合同单价（元）'] || row['合同单价'] || row['unit_price'] || row['Unit Price'] || 0),
        completed_qty: Number(row['已完成'] || row['已完成数量'] || row['completed_qty'] || 0),
        system: String(row['所属系统'] || row['系统'] || ''),
      })).filter(item => item.name); // 过滤掉空行

      setImportPreview(items);
      setShowImport(true);
    } catch (error) {
      console.error('解析文件失败:', error);
      toast.error('文件解析失败，请检查 Excel 格式');
    } finally {
      // 清空 input 以便重复上传同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmImport = async () => {
    if (importPreview.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch('/api/bom/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          items: importPreview,
          system: importSystem || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '导入失败');
      }

      const result = await res.json();
      toast.success(`导入完成：新增 ${result.created || 0} 条，更新 ${result.updated || 0} 条`);
      setShowImport(false);
      setImportPreview([]);
      fetchBomItems();
    } catch (error) {
      console.error('导入失败:', error);
      toast.error(error instanceof Error ? error.message : '导入失败，请重试');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      { '编号': 'JK-001', '名称': '监控立柱安装', '单位': '套', '数量': 100, '单价': 3500 },
      { '编号': 'JK-002', '名称': '高清球机安装', '单位': '台', '数量': 50, '单价': 6800 },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '工程量清单');
    XLSX.writeFile(wb, '工程量清单模板.xlsx');
  };

  const exportProjectBom = async () => {
    try {
      const response = await fetch(`/api/bom?projectId=${projectId}`);
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) throw new Error('清单加载失败');
      const items = data as BomItem[];
      if (items.length === 0) return toast.info('当前项目暂无清单数据');
      const rows = items.map((item) => ({
        '所属系统': item.system || '未指定',
        '编号': item.code,
        '子目名称': item.name,
        '单位': item.unit,
        '总工程量': item.total_qty,
        '合同单价（元）': item.unit_price || 0,
        '合同金额（元）': item.total_qty * (item.unit_price || 0),
        '已完成': item.completed_qty,
        '剩余工程量': Math.max(0, item.total_qty - item.completed_qty),
        '完成进度': `${getProgress(item)}%`,
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 12 },
        { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '项目清单');
      const safeProjectName = (project?.name || '当前项目').replace(/[\\/:*?"<>|]/g, '_');
      XLSX.writeFile(workbook, `${safeProjectName}_工程量清单_${new Date().toLocaleDateString('en-CA')}.xlsx`);
      toast.success(`已导出 ${items.length} 条项目清单`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出失败，请重试');
    }
  };

  const getProgress = (item: BomItem) => {
    return Math.round((item.completed_qty / item.total_qty) * 100);
  };

  const filteredItems = bomItems.filter((item) => {
    const keyword = searchText.trim().toLowerCase();
    const matchesSearch = !keyword || item.name.toLowerCase().includes(keyword) || item.code.toLowerCase().includes(keyword);
    const progress = getProgress(item);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'unfinished' && progress < 100) ||
      (statusFilter === 'completed' && progress >= 100) || (statusFilter === 'unpriced' && !(item.unit_price > 0));
    return matchesSearch && matchesStatus;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === bomItems.length ? [] : bomItems.map((b) => b.id)));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.length} 条清单子目吗？删除后不可恢复`)) return;
    try {
      const res = await fetch(`/api/bom?ids=${encodeURIComponent(selectedIds.join(','))}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success(`已删除 ${data.deleted} 条清单子目`);
        exitSelectMode();
        fetchBomItems();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      console.error('批量删除失败:', error);
      toast.error('删除失败，请重试');
    }
  };

  if (!projectId) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">缺少项目ID</p>
          <Link href="/manage/projects" className="text-[#1E5AA8]">返回项目管理</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] pb-20">
      <ManagePageHeader title="工程量清单" description={project?.name || '项目清单管理'} backHref="/manage/projects" action={<div className="flex items-center gap-1.5">
          {selectMode ? (
            <>
              <button
                onClick={exitSelectMode}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm"
              >
                取消
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={selectedIds.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4" />
                删除({selectedIds.length})
              </button>
            </>
          ) : (
            <>
              <button onClick={() => void exportProjectBom()} className="w-9 h-9 flex items-center justify-center bg-[#E8F0FE] text-[#1E5AA8] rounded-lg" title="导出项目清单">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={downloadTemplate} className="w-9 h-9 flex items-center justify-center bg-gray-100 text-gray-600 rounded-lg" title="下载导入模板">
                <FileSpreadsheet className="w-4 h-4" />
              </button>
              <button
                onClick={handleImportClick}
                className="w-9 h-9 flex items-center justify-center bg-[#16A34A] text-white rounded-lg"
                title="导入 Excel"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectMode(true)}
                className="w-9 h-9 flex items-center justify-center bg-red-50 text-red-500 rounded-lg"
                title="批量删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={openCreateForm}
                className="w-9 h-9 flex items-center justify-center bg-[#1E5AA8] text-white rounded-lg"
                title="添加子目"
              >
                <Plus className="w-4 h-4" />
              </button>
            </>
          )}
        </div>} />

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Summary + 系统筛选 */}
      <div className="mx-auto max-w-5xl p-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-gray-500">清单子目总数</span>
            <span className="flex items-center gap-3">
              {selectMode && (
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-[#1E5AA8] font-medium"
                >
                  {selectedIds.length === bomItems.length && bomItems.length > 0 ? '取消全选' : '全选'}
                </button>
              )}
              <span className="font-bold text-[#1A1A2E]">{bomItems.length} 项</span>
            </span>
          </div>
          {systems.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => setSystemFilter('')}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                  systemFilter === '' ? 'bg-[#1E5AA8] text-white' : 'bg-[#F5F6F8] text-gray-600'
                }`}
              >
                全部
              </button>
              {systems.map((s) => (
                <button
                  key={s}
                  onClick={() => setSystemFilter(systemFilter === s ? '' : s)}
                  className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                    systemFilter === s ? 'bg-[#1E5AA8] text-white' : 'bg-[#F5F6F8] text-gray-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索编号或子目名称"
            className="mt-3 w-full rounded-lg bg-[#F5F6F8] px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#1E5AA8]" />
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {([['all', '全部'], ['unfinished', '未完成'], ['completed', '已完成'], ['unpriced', '未定价']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-lg py-2 text-xs ${statusFilter === value ? 'bg-[#1E5AA8] text-white' : 'bg-gray-100 text-gray-500'}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* BOM List */}
      <div className="space-y-3 px-4 md:hidden">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>{bomItems.length === 0 ? '暂无清单子目' : '没有符合条件的子目'}</p>
            <button
              onClick={openCreateForm}
              className="mt-4 px-4 py-2 bg-[#1E5AA8] text-white rounded-lg text-sm"
            >
              添加第一个子目
            </button>
          </div>
        ) : (
          filteredItems.map((item) => {
            const progress = getProgress(item);
            const isSelected = selectedIds.includes(item.id);
            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl p-4 shadow-sm ${selectMode ? 'cursor-pointer' : ''}`}
                onClick={selectMode ? () => toggleSelect(item.id) : undefined}
              >
                <div className="flex items-start justify-between">
                  {selectMode && (
                    <div className="mr-3 mt-0.5">
                      <div className={`w-5 h-5 rounded flex items-center justify-center ${
                        isSelected ? 'bg-[#1E5AA8] border border-[#1E5AA8]' : 'bg-white border border-gray-300'
                      }`}>
                        {isSelected && <Check className="w-4 h-4 text-white" />}
                      </div>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-400 font-mono">{item.code}</span>
                      <h3 className="font-bold text-[#1A1A2E]">{item.name}</h3>
                      {item.system && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#F3E8FF] text-[#7C3AED] rounded shrink-0">
                          {item.system}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                      <span>{item.completed_qty} / {item.total_qty} {item.unit}</span>
                      <span className={`font-medium ${progress >= 100 ? 'text-green-600' : 'text-[#1E5AA8]'}`}>
                        {progress}%
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {item.unit_price > 0 ? `单价 ¥${item.unit_price.toLocaleString()} · 合同额 ¥${(item.total_qty * item.unit_price).toLocaleString()}` : '尚未填写合同单价，不参与自动进度'}
                    </div>
                    <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${progress >= 100 ? 'bg-green-500' : 'bg-[#1E5AA8]'}`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  </div>
                  {!selectMode && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => openEditForm(item)}
                        className="p-2 text-gray-400 hover:text-[#1E5AA8] hover:bg-blue-50 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mx-auto hidden max-w-5xl px-4 md:block">
        {filteredItems.length === 0 ? <div className="rounded-2xl bg-white py-16 text-center text-gray-400">{bomItems.length === 0 ? '暂无清单子目' : '没有符合条件的子目'}</div> : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500"><tr>{selectMode && <th className="w-12 px-4 py-3"></th>}<th className="px-4 py-3">编号 / 子目名称</th><th className="px-4 py-3">所属系统</th><th className="px-4 py-3 text-right">合同工程量</th><th className="px-4 py-3 text-right">已完成</th><th className="px-4 py-3 text-right">单价</th><th className="px-4 py-3 text-right">合同金额</th><th className="w-40 px-4 py-3">进度</th><th className="w-24 px-4 py-3 text-right">操作</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{filteredItems.map((item) => { const progress = getProgress(item); const isSelected = selectedIds.includes(item.id); return <tr key={item.id} className={`hover:bg-blue-50/30 ${isSelected ? 'bg-blue-50' : ''}`} onClick={selectMode ? () => toggleSelect(item.id) : undefined}>
              {selectMode && <td className="px-4 py-3"><div className={`flex h-5 w-5 items-center justify-center rounded border ${isSelected ? 'border-[#1E5AA8] bg-[#1E5AA8]' : 'border-gray-300'}`}>{isSelected && <Check className="h-4 w-4 text-white" />}</div></td>}
              <td className="px-4 py-3"><div className="font-medium text-gray-900">{item.name}</div><div className="mt-0.5 font-mono text-xs text-gray-400">{item.code}</div></td><td className="px-4 py-3 text-gray-600">{item.system || '未指定'}</td><td className="whitespace-nowrap px-4 py-3 text-right">{item.total_qty} {item.unit}</td><td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[#1E5AA8]">{item.completed_qty} {item.unit}</td><td className="whitespace-nowrap px-4 py-3 text-right text-gray-600">{item.unit_price > 0 ? `¥${item.unit_price.toLocaleString()}` : '未定价'}</td><td className="whitespace-nowrap px-4 py-3 text-right text-gray-600">{item.unit_price > 0 ? `¥${(item.total_qty * item.unit_price).toLocaleString()}` : '—'}</td>
              <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${progress >= 100 ? 'bg-green-500' : 'bg-[#1E5AA8]'}`} style={{ width: `${Math.min(progress, 100)}%` }} /></div><span className="w-10 text-right text-xs font-medium">{progress}%</span></div></td>
              <td className="px-4 py-3"><div className="flex justify-end gap-1">{!selectMode && <><button onClick={() => openEditForm(item)} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-[#1E5AA8]" aria-label={`编辑${item.name}`}><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDelete(item)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label={`删除${item.name}`}><Trash2 className="h-4 w-4" /></button></>}</div></td>
            </tr>; })}</tbody>
          </table></div></div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-[480px] bg-white rounded-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold">
                {editingItem ? '编辑子目' : '添加子目'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  编号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="如：JK-001"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">合同单价（元/{formData.unit}）</label>
                <input type="number" min="0" step="any" inputMode="decimal" value={formData.unit_price}
                  onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                  placeholder="用于按合同金额自动计算项目进度"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="如：监控立柱安装"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    所属系统
                  </label>
                  <select
                    value={formData.system}
                    onChange={(e) => setFormData({ ...formData, system: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                  >
                    <option value="">未指定</option>
                    {systems.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">单位</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                  >
                    <option value="米">米</option>
                    <option value="台">台</option>
                    <option value="套">套</option>
                    <option value="个">个</option>
                    <option value="组">组</option>
                    <option value="根">根</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  总工程量 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.total_qty}
                  onChange={(e) => setFormData({ ...formData, total_qty: e.target.value })}
                  placeholder="数量"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>

              {editingItem && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    已完成数量（手动修正）
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max={formData.total_qty || undefined}
                      step="any"
                      inputMode="decimal"
                      value={formData.completed_qty}
                      onChange={(e) => setFormData({ ...formData, completed_qty: e.target.value })}
                      className="w-full px-3 py-2.5 pr-14 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{formData.unit}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    日报漏报或历史数据不完整时可在这里修正，范围为 0～{formData.total_qty || 0} {formData.unit}
                  </p>
                  {Number(formData.completed_qty) !== editingItem.completed_qty && (
                    <textarea value={formData.adjustment_reason}
                      onChange={(e) => setFormData({ ...formData, adjustment_reason: e.target.value })}
                      placeholder="请填写修正原因，如：补录 8 月 20 日漏报工程量"
                      className="mt-2 w-full min-h-20 px-3 py-2.5 border border-amber-200 bg-amber-50 rounded-lg text-sm resize-none focus:outline-none focus:border-amber-400" />
                  )}
                </div>
              )}
              {editingItem && adjustments.length > 0 && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <h3 className="text-sm font-medium text-gray-700">历史修正记录</h3>
                  <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                    {adjustments.map((adjustment) => <div key={adjustment.id} className="rounded-lg bg-white p-2.5 text-xs">
                      <div className="flex justify-between"><span className="font-medium text-[#1E5AA8]">{adjustment.before_qty} → {adjustment.after_qty} {formData.unit}</span><span className="text-gray-400">{adjustment.created_at}</span></div>
                      <p className="mt-1 text-gray-600">{adjustment.reason}</p><p className="mt-0.5 text-gray-400">操作人：{adjustment.operator}</p>
                    </div>)}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full py-3 bg-[#1E5AA8] text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-[480px] bg-white rounded-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold">导入预览</h2>
              <button onClick={() => { setShowImport(false); setImportPreview([]); }} className="p-1">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  共识别到 <span className="font-bold">{importPreview.length}</span> 条清单项，请确认无误后导入。
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  导入到所属系统
                </label>
                <select
                  value={importSystem}
                  onChange={(e) => setImportSystem(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1E5AA8]"
                >
                  <option value="">按Excel中的所属系统（没有则未指定）</option>
                  {systems.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {importPreview.map((item, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#1A1A2E]">{item.name}</span>
                      <span className="text-xs text-gray-400">{item.code}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">{item.total_qty} {item.unit}</span>
                      <span className="text-xs text-gray-500">已完成 {item.completed_qty}</span>
                      <span className="text-xs text-gray-400">{item.system || '未指定系统'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex gap-3">
              <button
                onClick={() => { setShowImport(false); setImportPreview([]); }}
                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium"
              >
                取消
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className="flex-1 py-3 bg-[#16A34A] text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {importing ? '导入中...' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BomManagementPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center text-gray-400">加载中...</div>}>
      <BomManagement />
    </Suspense>
  );
}
