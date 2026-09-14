'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '@/components/project-provider';
import { AlertTriangle, Check, ChevronRight, CircleCheck, CircleX, ImagePlus, Link2, MapPin, ShieldCheck, Users, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeMatchText, rankBomMatches } from '@/lib/bom-matcher';

interface Worker {
  id: string;
  name: string;
  role: string;
}

interface BomItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  system?: string | null;
  total_qty?: number;
  completed_qty?: number;
}

interface WorkItemDraft {
  key: number;
  name: string;
  code?: string;
  unit: string;
  quantity: string;
  location: string;
  attendance: 'full' | 'half' | 'none';
  overtime: boolean;
  overtimeHours: string;
  external: boolean;
  workers: string[];
  bomItemId?: string | null;
}

interface Photo {
  name: string;
  url: string;
}

interface EditableReport {
  id: string;
  date: string;
  system?: string | null;
  work_items?: string | null;
  work_type: string;
  unit: string;
  quantity: number;
  location: string;
  workers: string;
  weather?: string | null;
  notes?: string | null;
  tomorrow_plan?: string | null;
  tomorrow_location?: string | null;
  photos: string;
}

interface PendingPhoto {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
  originalSize: number;
}

interface InspectionResult {
  canSubmit: boolean;
  checks: Array<{ level: 'error' | 'warning' | 'passed'; field: string; message: string; itemIndex?: number }>;
  summary: { passed: number; warnings: number; errors: number };
  source: { date: string; checkedAt: string; rules: string[] };
  aiReview: { enabled: boolean; available: boolean; model?: string; notice?: string; items: Array<{ index: number; clarity: 'clear' | 'improve'; suggestedLocation: string; suggestedDescription: string; risks: string[] }> };
  error?: string;
}

interface MatchHistoryRow { query_text: string; bom_item_id: string; confirm_count: number }

const UNITS = ['米', '台', '套', '个', '处', '根'];
const WEATHERS = ['晴', '多云', '阴', '小雨', '中雨', '大雨', '雪'];

let workItemKeySeq = 1;
function nextWorkItemKey() {
  return workItemKeySeq++;
}

export default function ReportPage() {
  const router = useRouter();
  const { currentProject, isReady } = useProject();

  const [date, setDate] = useState('');
  const [selectedSystem, setSelectedSystem] = useState('');
  const [workItems, setWorkItems] = useState<WorkItemDraft[]>([
    { key: nextWorkItemKey(), name: '', unit: '米', quantity: '', location: '', attendance: 'full', overtime: false, overtimeHours: '', external: false, workers: [] },
  ]);
  const [weather, setWeather] = useState('晴');
  const [notes, setNotes] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [tomorrowLocation, setTomorrowLocation] = useState('');
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState('');
  const [planLocationDraft, setPlanLocationDraft] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<Photo[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspecting, setInspecting] = useState(false);

  // 联想数据
  const [bomItems, setBomItems] = useState<BomItem[]>([]);
  const [workerList, setWorkerList] = useState<Worker[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string | null; name: string }>>([]);
  const [systems, setSystems] = useState<string[]>([]);
  const [lastWorkerIds, setLastWorkerIds] = useState<string[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryRow[]>([]);
  const [ready, setReady] = useState(false);

  // 联想下拉状态
  const [focusedWorkItemKey, setFocusedWorkItemKey] = useState<number | null>(null);
  const [focusedLocationKey, setFocusedLocationKey] = useState<number | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const pendingPhotosRef = useRef<PendingPhoto[]>([]);

  useEffect(() => {
    setDate(new Date().toLocaleDateString('en-CA'));
    setEditId(new URLSearchParams(window.location.search).get('edit'));
  }, []);

  useEffect(() => {
    pendingPhotosRef.current = pendingPhotos;
  }, [pendingPhotos]);

  useEffect(() => () => {
    pendingPhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  useEffect(() => {
    if (!isReady || currentProject.name === '加载中...') return;
    async function fetchData() {
      try {
        const [bomRes, workersRes, locRes, sysRes, reportRes, matchRes] = await Promise.all([
          fetch(`/api/bom?projectId=${currentProject.id}`),
          fetch(`/api/workers?projectId=${currentProject.id}`),
          fetch(`/api/locations?projectId=${currentProject.id}`),
          fetch(`/api/systems?projectId=${currentProject.id}`),
          fetch(editId ? `/api/reports?id=${encodeURIComponent(editId)}` : `/api/reports?projectId=${currentProject.id}&latest=1`),
          fetch(`/api/bom/match?projectId=${currentProject.id}`),
        ]);
        const [bomData, workersData, locData, sysData, reportData, matchData] = await Promise.all([
          bomRes.json(),
          workersRes.json(),
          locRes.json(),
          sysRes.json(),
          reportRes.json(),
          matchRes.json(),
        ]);
        setBomItems(Array.isArray(bomData) ? bomData : []);
        setWorkerList(Array.isArray(workersData) ? workersData : []);
        setLocations(Array.isArray(locData) ? locData : []);
        setMatchHistory(Array.isArray(matchData) ? matchData : []);
        const systemNames = Array.isArray(sysData) ? sysData.map((s: { name: string }) => s.name) : [];
        setSystems(systemNames);
        if (systemNames.length > 0) {
          setSelectedSystem(systemNames[0]);
        }

        // 最近一条报工的人员，用于现场快速复用。
        if (!editId && reportData && typeof reportData === 'object') {
          const latest = reportData as { workers?: unknown };
          if (typeof latest.workers === 'string') {
            try {
              const parsed: unknown = JSON.parse(latest.workers);
              if (Array.isArray(parsed)) {
                setLastWorkerIds(parsed.filter((id): id is string => typeof id === 'string'));
              }
            } catch {
              setLastWorkerIds([]);
            }
          }
        }


        if (editId) {
          if (!reportRes.ok || !reportData || typeof reportData !== 'object') {
            toast.error('要修改的报工记录不存在');
            router.replace('/records');
            return;
          }
          const report = reportData as EditableReport;
          let parsedWorkers: string[] = [];
          let parsedItems: Array<Record<string, unknown>> = [];
          let parsedPhotos: Photo[] = [];
          try {
            const value: unknown = JSON.parse(report.workers || '[]');
            if (Array.isArray(value)) parsedWorkers = value.filter((id): id is string => typeof id === 'string');
          } catch { /* 使用空人员 */ }
          try {
            const value: unknown = JSON.parse(report.work_items || '[]');
            if (Array.isArray(value)) parsedItems = value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
          } catch { /* 使用旧版单条数据 */ }
          try {
            const value: unknown = JSON.parse(report.photos || '[]');
            if (Array.isArray(value)) parsedPhotos = value.filter((item): item is Photo => !!item && typeof item === 'object' && typeof (item as Photo).url === 'string');
          } catch { /* 使用空照片 */ }
          const drafts: WorkItemDraft[] = parsedItems.length > 0
            ? parsedItems.map((item) => ({
                key: nextWorkItemKey(),
                name: typeof item.name === 'string' ? item.name : '',
                code: typeof item.code === 'string' ? item.code : undefined,
                unit: typeof item.unit === 'string' ? item.unit : '米',
                quantity: typeof item.quantity === 'number' ? String(item.quantity) : '',
                location: typeof item.location === 'string' ? item.location : report.location,
                attendance: item.attendance === 'half' ? 'half' : item.attendance === 'none' ? 'none' : 'full',
                overtime: typeof item.overtimeHours === 'number' && item.overtimeHours > 0,
                overtimeHours: typeof item.overtimeHours === 'number' && item.overtimeHours > 0 ? String(item.overtimeHours) : '',
                external: item.external === true,
                workers: Array.isArray(item.workers) ? item.workers.filter((id): id is string => typeof id === 'string') : parsedWorkers,
                bomItemId: typeof item.bomItemId === 'string' ? item.bomItemId : null,
              }))
            : [{ key: nextWorkItemKey(), name: report.work_type, unit: report.unit, quantity: String(report.quantity),
                location: report.location, attendance: 'full', overtime: false, overtimeHours: '', external: false,
                workers: parsedWorkers }];
          setDate(report.date);
          setSelectedSystem(report.system || '');
          setWorkItems(drafts);
          setWeather(report.weather || '晴');
          setNotes(report.notes || '');
          setTomorrowPlan(report.tomorrow_plan || '');
          setTomorrowLocation(report.tomorrow_location || '');
          setExistingPhotos(parsedPhotos);
        }

      } catch (error) {
        console.error('加载基础数据失败:', error);
      } finally {
        setReady(true);
      }
    }
    fetchData();
  }, [currentProject.id, currentProject.name, editId, isReady, router]);

  const updateWorkItem = (key: number, patch: Partial<WorkItemDraft>) => {
    setWorkItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const addWorkItem = () => {
    setWorkItems((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, {
        key: nextWorkItemKey(),
        name: '',
        unit: last.unit || '米',
        quantity: '',
        location: last.location || '',
        attendance: last.attendance || 'full',
        overtime: last.overtime || false,
        overtimeHours: last.overtimeHours || '',
        external: last.external || false,
        workers: [],
      }];
    });
  };

  const removeWorkItem = (key: number) => {
    setWorkItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  };

  const pickBomItem = (item: BomItem) => {
    if (focusedWorkItemKey === null) return;
    const queryText = workItems.find((workItem) => workItem.key === focusedWorkItemKey)?.name.trim() || '';
    updateWorkItem(focusedWorkItemKey, {
      name: item.name,
      code: item.code,
      unit: item.unit,
      bomItemId: item.id,
    });
    if (queryText) {
      void fetch('/api/bom/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: currentProject.id, queryText, bomItemId: item.id }) });
      const normalized = normalizeMatchText(queryText);
      setMatchHistory((current) => {
        const found = current.find((row) => row.query_text === normalized && row.bom_item_id === item.id);
        return found ? current.map((row) => row === found ? { ...row, confirm_count: row.confirm_count + 1 } : row) : [...current, { query_text: normalized, bom_item_id: item.id, confirm_count: 1 }];
      });
    }
    setFocusedWorkItemKey(null);
  };

  const toggleWorkItemWorker = (key: number, id: string) => {
    setWorkItems((prev) =>
      prev.map((it) =>
        it.key === key
          ? { ...it, workers: it.workers.includes(id) ? it.workers.filter((w) => w !== id) : [...it.workers, id] }
          : it,
      ),
    );
  };

  const toggleAllWorkItemWorkers = (key: number) => {
    const item = workItems.find((it) => it.key === key);
    const allWorkerIds = workerList.map((worker) => worker.id);
    updateWorkItem(key, { workers: item?.workers.length === allWorkerIds.length ? [] : allWorkerIds });
  };

  const reuseLastWorkers = (key: number) => {
    const availableIds = new Set(workerList.map((worker) => worker.id));
    updateWorkItem(key, { workers: lastWorkerIds.filter((id) => availableIds.has(id)) });
  };

  const compressPhoto = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const maxDimension = 1600;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        bitmap.close();
        return file;
      }
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
      if (!blob || blob.size >= file.size) return file;
      const baseName = file.name.replace(/\.[^.]+$/, '') || '施工照片';
      return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
    } catch {
      // HEIC 等浏览器暂不支持解码的格式保留原文件，避免选择失败。
      return file;
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setPreparingPhotos(true);
    try {
      const selected: PendingPhoto[] = [];
      for (const [index, originalFile] of Array.from(files).entries()) {
        const file = await compressPhoto(originalFile);
        selected.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${index}-${Date.now()}`,
          name: file.name,
          file,
          previewUrl: URL.createObjectURL(file),
          originalSize: originalFile.size,
        });
      }
      setPendingPhotos((prev) => [...prev, ...selected]);
    } finally {
      setPreparingPhotos(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const removePendingPhoto = (id: string) => {
    setPendingPhotos((prev) => {
      const target = prev.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((photo) => photo.id !== id);
    });
  };

  const handleSubmit = async (inspectionConfirmed = false) => {
    if (!date) return toast.error('请填写施工日期');
    const validItems = workItems.filter((it) => it.name.trim());
    if (validItems.length === 0) return toast.error('请至少填写一条施工内容');
    for (const it of validItems) {
      const q = Number(it.quantity);
      if (!it.name.trim() || !Number.isFinite(q) || q <= 0) {
        return toast.error(`「${it.name || '施工内容'}」的工程量需大于 0`);
      }
      if (!it.location.trim()) {
        return toast.error(`「${it.name}」请填写施工位置（桩号）`);
      }
      if (it.overtime && (!it.overtimeHours || Number(it.overtimeHours) <= 0)) {
        return toast.error(`「${it.name}」勾选了加班，请填写加班小时数`);
      }
      if (it.attendance === 'none' && !it.overtime) {
        return toast.error(`「${it.name}」请选择出勤（全天/半天）或勾选加班`);
      }
    }

    if (!inspectionConfirmed) {
      setInspecting(true);
      try {
        const response = await fetch('/api/reports/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: currentProject.id, editId, date, system: selectedSystem,
            workItems: validItems.map((item) => ({ ...item, quantity: Number(item.quantity) })) }),
        });
        const responseText = await response.text();
        if (!responseText) throw new Error('填报检查服务未返回内容，请刷新页面后重试');
        let result: InspectionResult;
        try { result = JSON.parse(responseText) as InspectionResult; }
        catch { throw new Error('填报检查服务返回异常，请确认服务已更新并重启'); }
        if (!response.ok) throw new Error(result.error || '填报检查失败');
        setInspection(result);
        setInspectionOpen(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '填报检查失败');
      } finally {
        setInspecting(false);
      }
      return;
    }

    setSubmitting(true);
    setUploadProgress(pendingPhotos.length > 0 ? { completed: 0, total: pendingPhotos.length } : null);
    const uploadedPhotos: Photo[] = [];
    try {
      const firstContent = validItems[0]?.name || '施工内容';
      const firstLocation = validItems[0]?.location || '现场';
      for (let index = 0; index < pendingPhotos.length; index++) {
        const pendingPhoto = pendingPhotos[index];
        const formData = new FormData();
        formData.append('file', pendingPhoto.file);
        formData.append('projectId', currentProject.id);
        formData.append('date', date);
        formData.append('workType', firstContent);
        formData.append('location', firstLocation);
        const uploadResponse = await fetch('/api/photos/upload', { method: 'POST', body: formData });
        const uploadResult: { success?: boolean; name?: string; url?: string; error?: string } = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadResult.success || !uploadResult.name || !uploadResult.url) {
          throw new Error(uploadResult.error || `第 ${index + 1} 张照片上传失败`);
        }
        uploadedPhotos.push({ name: uploadResult.name, url: uploadResult.url });
        setUploadProgress({ completed: index + 1, total: pendingPhotos.length });
      }

      // 报工级人员 = 所有条目人员的并集（兼容旧统计）
      const allWorkerIds = [...new Set(validItems.flatMap((it) => it.workers))];
      const response = await fetch(editId ? `/api/reports?id=${encodeURIComponent(editId)}` : '/api/reports', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          date,
          location: validItems[0].location.trim(),
          system: selectedSystem || null,
          workItems: validItems.map((it) => ({
            name: it.name.trim(),
            code: it.code || undefined,
            unit: it.unit,
            quantity: Number(it.quantity),
            location: it.location.trim(),
            attendance: it.attendance,
            overtimeHours: it.overtime ? (Number(it.overtimeHours) || 0) : 0,
            external: it.external,
            workers: it.workers,
            bomItemId: it.bomItemId || null,
          })),
          workers: allWorkerIds,
          weather: weather || null,
          issue: null,
          notes: notes.trim() || null,
          tomorrowPlan: tomorrowPlan.trim() || null,
          tomorrowLocation: tomorrowLocation.trim() || null,
          photos: [...existingPhotos, ...uploadedPhotos],
          submitter: '管理员',
        }),
      });

      const responseText = await response.text();
      let result: { error?: string } = {};
      if (responseText) {
        try { result = JSON.parse(responseText) as { error?: string }; }
        catch { result = { error: '服务器返回异常，请稍后重试' }; }
      }
      if (response.ok) {
        // 记住本次的人员，方便下次快速填写
        localStorage.setItem(`report_last_workers_${currentProject.id}`, JSON.stringify(allWorkerIds));
        toast.success(editId ? '报工记录修改成功' : '报工提交成功');
        router.push('/records');
      } else {
        toast.error(result.error || '提交失败，请重试');
      }
    } catch (error: unknown) {
      await Promise.allSettled(uploadedPhotos.map((photo) => fetch(photo.url, { method: 'DELETE' })));
      console.error('Submit error:', error);
      toast.error(error instanceof Error ? error.message : '提交失败，请重试');
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const matchedBom = (key: number) => {
    const it = workItems.find((w) => w.key === key);
    if (!it || !it.name.trim() || it.bomItemId) return [];
    const normalized = normalizeMatchText(it.name);
    const history = Object.fromEntries(matchHistory.filter((row) => row.query_text === normalized).map((row) => [row.bom_item_id, row.confirm_count]));
    return rankBomMatches(it.name, bomItems, { system: selectedSystem, unit: it.unit, history });
  };

  /** 判断桩号主干数字段是否以输入开头（如输入 15 时 K15+015 / ZK15+xxx 优先） */
  const matchesMain = (name: string, q: string) => {
    const m = name.match(/^([A-Za-z]+)(\d+)/);
    return !!m && m[2].startsWith(q);
  };

  /** 位置联想：优先"桩号数字段以输入开头"（如输入15 → K15+***优先），其次包含匹配 */
  const matchedLocations = (query: string) => {
    const segs = query.split(/[、,，~\-–—\s]+/).filter(Boolean);
    const lastSeg = segs[segs.length - 1] || '';
    if (!lastSeg) return locations.slice(0, 10);
    const direct = locations.filter((l) => l.name !== lastSeg && matchesMain(l.name, lastSeg));
    if (direct.length > 0) return direct.slice(0, 10);
    const matched = locations.filter((l) => l.name.includes(lastSeg) && l.name !== lastSeg);
    return (matched.length > 0 ? matched : locations).slice(0, 10);
  };

  return (
    <div className="min-h-screen bg-[#F3F5F8] pb-8 text-[14px] text-[#1A1A2E]">
      {!ready ? (
        <div className="flex items-center justify-center py-20 text-gray-400">加载中...</div>
      ) : (
        <div className="space-y-3.5 px-4 py-4">
          <div className="px-1 pb-1">
            <h1 className="text-[20px] font-bold tracking-tight">施工报工</h1>
            <p className="mt-1 text-[13px] leading-5 text-gray-500">{editId ? '修改施工内容、人员考勤和现场照片' : '填写当天施工内容、人员考勤和现场照片'}</p>
          </div>
          {/* 日期 + 所属系统 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-[16px] font-semibold">基本信息</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-gray-600">施工日期</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-gray-200 bg-[#F8F9FB] px-3 text-[15px] leading-none focus:border-[#1E5AA8] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-gray-600">所属系统</label>
                <select
                  value={selectedSystem}
                  onChange={(e) => setSelectedSystem(e.target.value)}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-[#F8F9FB] px-3 text-[15px] focus:border-[#1E5AA8] focus:outline-none"
                >
                  {systems.length === 0 && <option value="">暂无系统</option>}
                  {systems.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* 施工内容（多条，每条含位置） */}
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold">施工内容</h2>
                <p className="mt-0.5 text-[12px] text-gray-400">每项内容独立记录位置、数量与考勤</p>
              </div>
              <span className="shrink-0 text-[12px] text-gray-400">共 {workItems.length} 项</span>
            </div>
            <div className="space-y-3">
              {workItems.map((it, idx) => {
                const matches = focusedWorkItemKey === it.key ? matchedBom(it.key) : [];
                const locMatches = focusedLocationKey === it.key ? matchedLocations(it.location) : [];
                // 考勤记录提示文本
                const otNum = Number(it.overtimeHours) || 0;
                let tipText = '';
                if (it.attendance === 'full') tipText = '全天';
                else if (it.attendance === 'half') tipText = '半天';
                else tipText = '未选出勤';
                if (otNum > 0) {
                  tipText = it.attendance === 'none' ? `仅加班${otNum}小时（不计出勤）` : `${tipText} + 加班${otNum}小时`;
                } else if (it.attendance === 'none') {
                  tipText = '未选出勤（请选择全天/半天或勾选加班）';
                }
                return (
                  <div key={it.key} className="rounded-2xl border border-[#DDE7F5] bg-[#F7F9FC] p-3.5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-[14px] font-semibold">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E5AA8] text-[12px] text-white">{idx + 1}</span>
                        施工项目
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={it.external}
                            onChange={(e) => updateWorkItem(it.key, { external: e.target.checked })}
                            className="w-4 h-4 accent-[#7C3AED]"
                          />
                          <span className={`text-[12px] font-medium ${it.external ? 'text-[#7C3AED]' : 'text-gray-500'}`}>
                            合同外
                          </span>
                        </label>
                        {workItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeWorkItem(it.key)}
                            className="p-1 text-red-400 hover:text-red-500"
                            aria-label="删除"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="relative mb-2.5">
                      <label className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-gray-600"><MapPin className="h-3.5 w-3.5" />施工位置</label>
                      <input
                        type="text"
                        value={it.location}
                        onChange={(e) => {
                          // 输入时强制激活联想，避免焦点状态丢失导致不弹出
                          setFocusedLocationKey(it.key);
                          updateWorkItem(it.key, { location: e.target.value });
                        }}
                        onFocus={() => setFocusedLocationKey(it.key)}
                        onBlur={() => setTimeout(() => setFocusedLocationKey(null), 150)}
                        placeholder="如 K12+300"
                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-[15px] placeholder:text-gray-300 focus:border-[#E8740C] focus:outline-none"
                      />
                      {locMatches.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg z-20 max-h-40 overflow-auto">
                          {locMatches.map((loc) => (
                            <button
                              key={loc.name}
                              type="button"
                              onMouseDown={(e) => {
                                // 阻止默认行为，避免输入框失焦导致下拉提前关闭
                                e.preventDefault();
                                // 点选 = 替换"正在输入的一段"；前面已有的段保留，用顿号连接
                                const segs = it.location.split(/[、,，~\-–—\s]+/);
                                const prefix = segs.slice(0, -1).filter(Boolean).join('、');
                                updateWorkItem(it.key, {
                                  location: prefix ? `${prefix}、${loc.name}` : loc.name,
                                });
                                setFocusedLocationKey(null);
                              }}
                              className="block w-full px-4 py-2.5 text-left text-[14px] hover:bg-[#E8F0FE]"
                            >
                              {loc.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="mb-3 text-[11px] leading-4 text-gray-400">
                      支持多个桩号（K1+000、K2+000）或区间（K11+000~K12+500）；点选联想会替换当前输入的一段
                    </p>
                    <div className="relative">
                      <label className="mb-1.5 block text-[13px] font-medium text-gray-600">施工内容</label>
                      <input
                        type="text"
                        value={it.name}
                        onChange={(e) => {
                          // 输入时强制激活联想
                          setFocusedWorkItemKey(it.key);
                          updateWorkItem(it.key, { name: e.target.value });
                        }}
                        onFocus={() => setFocusedWorkItemKey(it.key)}
                        onBlur={() => setTimeout(() => setFocusedWorkItemKey(null), 150)}
                        placeholder="输入关键词从清单选择，或直接输入内容"
                        className={`h-11 w-full rounded-xl border px-3.5 text-[15px] placeholder:text-gray-300 focus:outline-none ${it.bomItemId ? 'border-[#93B4E2] bg-[#F2F7FF] font-medium text-[#1E5AA8] focus:border-[#1E5AA8]' : 'border-gray-200 bg-white focus:border-[#1E5AA8]'}`}
                      />
                      {matches.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg z-20 max-h-48 overflow-auto">
                          {matches.map((match) => (
                            <button
                              key={match.item.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickBomItem(match.item);
                              }}
                              className="block w-full text-left px-4 py-2.5 hover:bg-[#E8F0FE]"
                            >
                              <div className="flex items-center justify-between gap-2 text-[14px]"><span>{match.item.code} · {match.item.name}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${match.score >= 80 ? 'bg-green-50 text-green-600' : match.score >= 55 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{match.score}%</span></div>
                              <div className="mt-0.5 text-[12px] text-gray-400">
                                {match.reasons.join(' · ')} · 数量 {match.item.total_qty ?? 0}{match.item.unit}
                                {typeof match.item.total_qty === 'number' && typeof match.item.completed_qty === 'number' && match.item.total_qty - match.item.completed_qty > 0 && (
                                  <span className="text-gray-300 ml-1.5">
                                    剩余 {match.item.total_qty - match.item.completed_qty}{match.item.unit}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {it.bomItemId && <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[#E8F0FE] px-2.5 py-2 text-xs text-[#1E5AA8]"><span className="flex min-w-0 items-center gap-1.5"><Link2 className="h-3.5 w-3.5 shrink-0"/><span className="truncate">已关联：{it.code || bomItems.find((item) => item.id === it.bomItemId)?.code || '清单子目'}，可继续补充施工描述</span></span><button type="button" onClick={() => updateWorkItem(it.key, { code: undefined, bomItemId: null })} className="shrink-0 rounded-md bg-white/70 px-2 py-1 text-[11px]">取消关联</button></div>}
                    </div>
                    <div className="mt-2.5 grid grid-cols-[1fr_92px] gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={it.quantity}
                        onChange={(e) => updateWorkItem(it.key, { quantity: e.target.value })}
                        placeholder="数量"
                        className="h-11 min-w-0 rounded-xl border border-gray-200 bg-white px-3.5 text-[15px] placeholder:text-gray-300 focus:border-[#1E5AA8] focus:outline-none"
                      />
                      <select
                        value={it.unit}
                        onChange={(e) => updateWorkItem(it.key, { unit: e.target.value })}
                        className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-[15px] focus:border-[#1E5AA8] focus:outline-none"
                      >
                        {(it.unit && !UNITS.includes(it.unit) ? [it.unit, ...UNITS] : UNITS).map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    {/* 出勤 + 加班 */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
                      <div className="flex items-center gap-1.5">
                        <span className="mr-0.5 text-[13px] font-medium text-gray-600">出勤</span>
                        {[
                          { key: 'full', label: '全天' },
                          { key: 'half', label: '半天' },
                        ].map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => updateWorkItem(it.key, { attendance: it.attendance === opt.key ? 'none' : (opt.key as 'full' | 'half') })}
                            className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                              it.attendance === opt.key
                                ? 'bg-[#1E5AA8] text-white border-[#1E5AA8]'
                                : 'bg-white text-gray-600 border-transparent'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !it.overtime;
                          updateWorkItem(it.key, {
                            overtime: next,
                            // 首次勾选加班：取消默认的全天；取消加班时：恢复默认全天并清空加班小时
                            attendance: next
                              ? (it.attendance === 'full' ? 'none' : it.attendance)
                              : (it.attendance === 'none' ? 'full' : it.attendance),
                            overtimeHours: next ? it.overtimeHours : '',
                          });
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                          it.overtime
                            ? 'bg-[#E8740C] text-white border-[#E8740C]'
                            : 'bg-white text-gray-600 border-transparent'
                        }`}
                      >
                        加班
                      </button>
                      {it.overtime && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.5"
                            value={it.overtimeHours}
                            onChange={(e) => updateWorkItem(it.key, { overtimeHours: e.target.value })}
                            placeholder="小时数"
                            className="h-9 w-20 rounded-lg border border-[#E8740C] bg-white px-2 text-[14px] placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-[#E8740C]"
                          />
                          <span className="text-[13px] text-gray-500">小时</span>
                        </div>
                      )}
                    </div>
                    {/* 参与人员（每条内容独立选择） */}
                    <div className="mt-3">
                      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-[13px] font-medium text-gray-600">
                          <Users className="h-4 w-4" />参与人员
                          <span className="font-normal text-gray-400">({it.workers.length}人)</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleAllWorkItemWorkers(it.key)}
                            className="rounded-md bg-white px-2 py-1 text-[12px] font-medium text-[#1E5AA8] ring-1 ring-inset ring-[#BCD0EB]"
                          >
                            {it.workers.length === workerList.length && workerList.length > 0 ? '清空' : '全选'}
                          </button>
                          <button
                            type="button"
                            onClick={() => reuseLastWorkers(it.key)}
                            disabled={lastWorkerIds.length === 0}
                            className="rounded-md bg-white px-2 py-1 text-[12px] font-medium text-[#1E5AA8] ring-1 ring-inset ring-[#BCD0EB] disabled:text-gray-300 disabled:ring-gray-200"
                          >
                            上次人员
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {workerList.map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => toggleWorkItemWorker(it.key, w.id)}
                            aria-pressed={it.workers.includes(w.id)}
                            className={`relative flex h-11 min-w-0 touch-manipulation select-none items-center justify-center rounded-xl border px-5 text-center text-[13px] font-medium transition-colors active:scale-[0.98] ${
                              it.workers.includes(w.id) ? 'border-[#1E5AA8] bg-[#1E5AA8] text-white' : 'border-gray-200 bg-white text-gray-600'
                            }`}
                          >
                            {it.workers.includes(w.id) && <Check className="absolute left-2 h-3.5 w-3.5" />}
                            <span className="min-w-0 truncate">{w.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* 考勤记录提示（条目底部） */}
                    <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-dashed border-gray-200 pt-2.5">
                      <span className="text-[12px] text-gray-500">考勤记录：</span>
                      <span className={`text-[13px] font-semibold ${
                        it.attendance === 'none' && otNum <= 0 ? 'text-red-500' : 'text-[#1E5AA8]'
                      }`}>
                        {tipText}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addWorkItem}
              className="mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-xl border border-dashed border-[#1E5AA8]/50 bg-[#F6FAFF] text-[14px] font-medium text-[#1E5AA8]"
            >
              <Plus className="w-4 h-4" /> 增加施工内容
            </button>
          </section>

          {/* 天气 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-[16px] font-semibold">天气</h2>
            <div className="flex flex-wrap gap-2">
              {WEATHERS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeather(weather === w ? '' : w)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                    weather === w ? 'bg-[#1E5AA8] text-white' : 'bg-[#F5F6F8] text-gray-600'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </section>

          {/* 现场说明 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-2.5">
              <h2 className="text-[16px] font-semibold">现场说明 <span className="text-[12px] font-normal text-gray-400">选填</span></h2>
              <p className="mt-0.5 text-[12px] text-gray-400">异常、材料情况或其他需要补充的内容</p>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如：材料短缺、位置调整、现场协调情况……"
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 bg-[#F8F9FB] px-3.5 py-2.5 text-[14px] leading-5 placeholder:text-gray-300 focus:border-[#1E5AA8] focus:outline-none"
            />
          </section>

          {/* 明日计划：默认只显示一行，避免拉长报工页 */}
          <button type="button" onClick={() => { setPlanDraft(tomorrowPlan); setPlanLocationDraft(tomorrowLocation); setPlanEditorOpen(true); }}
            className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 text-left shadow-sm">
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="text-[16px] font-semibold">明日计划</h2><span className="text-[12px] text-gray-400">选填</span></div><p className={`mt-0.5 truncate text-[12px] ${tomorrowPlan ? 'text-gray-500' : 'text-gray-400'}`}>{tomorrowPlan || '未填写'}{tomorrowPlan && tomorrowLocation ? ` · ${tomorrowLocation}` : ''}</p></div>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-300" />
          </button>

          {/* 施工照片 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <h2 className="text-[16px] font-semibold">施工照片</h2>
              <p className="mt-0.5 text-[12px] text-gray-400">点击后可使用手机拍照或从相册选择多张</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {existingPhotos.map((photo) => (
                <div key={photo.url} className="relative h-20 w-20 overflow-hidden rounded-lg bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.name} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setExistingPhotos((prev) => prev.filter((item) => item.url !== photo.url))}
                    disabled={submitting} className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white" aria-label="删除原照片">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {pendingPhotos.map((photo) => (
                <div key={photo.id} className="relative h-20 w-20 overflow-hidden rounded-lg bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.previewUrl} alt={photo.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePendingPhoto(photo.id)}
                    disabled={submitting}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center"
                    aria-label="删除照片"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {photo.file.size < photo.originalSize && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">已压缩</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3">
              <button type="button" onClick={() => photoInputRef.current?.click()} disabled={submitting || preparingPhotos} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#BCD0EB] bg-[#F5F9FF] text-[14px] font-medium text-[#1E5AA8] disabled:opacity-50">
                <ImagePlus className="h-4 w-4" />
                {preparingPhotos ? '正在压缩照片…' : `添加施工照片${pendingPhotos.length + existingPhotos.length > 0 ? `（共${pendingPhotos.length + existingPhotos.length}张）` : ''}`}
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={handlePhotoChange} disabled={submitting || preparingPhotos} className="hidden" />
            </div>
            {uploadProgress && (
              <div className="mt-3 rounded-xl bg-[#F5F9FF] p-3">
                <div className="mb-2 flex items-center justify-between text-[12px] text-[#1E5AA8]">
                  <span>正在上传照片 {uploadProgress.completed}/{uploadProgress.total}</span>
                  <span>{Math.round((uploadProgress.completed / uploadProgress.total) * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#DDE8F6]">
                  <div className="h-full rounded-full bg-[#1E5AA8] transition-all duration-300" style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }} />
                </div>
              </div>
            )}
            <p className="mt-2.5 text-[11px] leading-4 text-gray-400">
              选择后自动压缩至最长边 1600px，仅在本机预览，提交报工时统一上传
            </p>
          </section>

          {planEditorOpen && <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPlanEditorOpen(false); }}>
            <section className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl">
              <div className="flex items-center justify-between"><div><h2 className="text-[18px] font-semibold">明日计划</h2><p className="mt-1 text-xs text-gray-400">仅作施工安排，不计入今日完成量</p></div><button type="button" onClick={() => setPlanEditorOpen(false)} className="rounded-lg p-2 text-gray-400"><X className="h-5 w-5" /></button></div>
              <label className="mt-5 block text-[13px] font-medium text-gray-600">计划施工内容</label>
              <textarea value={planDraft} onChange={(event) => setPlanDraft(event.target.value)} rows={4} maxLength={500} placeholder="例如：安装摄像机立柱、敷设通信光缆……" className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-[#F8F9FB] px-3.5 py-3 text-[14px] leading-6 placeholder:text-gray-300 focus:border-[#1E5AA8] focus:outline-none" />
              <label className="mt-4 block text-[13px] font-medium text-gray-600">计划位置 <span className="font-normal text-gray-400">选填</span></label>
              <input value={planLocationDraft} onChange={(event) => setPlanLocationDraft(event.target.value)} maxLength={200} placeholder="例如：XX收费站、K32+922" className="mt-2 w-full rounded-xl border border-gray-200 bg-[#F8F9FB] px-3.5 py-3 text-[14px] placeholder:text-gray-300 focus:border-[#1E5AA8] focus:outline-none" />
              <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPlanEditorOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm text-gray-600">取消</button><button type="button" onClick={() => { const content = planDraft.trim(); setTomorrowPlan(content); setTomorrowLocation(content ? planLocationDraft.trim() : ''); setPlanEditorOpen(false); }} className="rounded-xl bg-[#1E5AA8] px-5 py-2.5 text-sm font-medium text-white">保存</button></div>
            </section>
          </div>}

          {/* 提交 */}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || inspecting}
            className="h-13 w-full rounded-2xl bg-[#16A34A] text-[16px] font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
          >
            {inspecting ? '正在检查填报内容…' : submitting
              ? uploadProgress
                ? `上传照片 ${uploadProgress.completed}/${uploadProgress.total}`
                : '正在提交…'
              : editId ? '保存修改' : '提交报工'}
          </button>
          {inspectionOpen && inspection && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setInspectionOpen(false); }}>
            <section className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-2xl">
              <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className={`rounded-xl p-2.5 ${inspection.summary.errors ? 'bg-red-50 text-red-600' : inspection.summary.warnings ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>{inspection.summary.errors ? <CircleX className="h-5 w-5"/> : inspection.summary.warnings ? <AlertTriangle className="h-5 w-5"/> : <ShieldCheck className="h-5 w-5"/>}</div><div><h2 className="text-[17px] font-semibold">本次填报检查</h2><p className="mt-1 text-xs text-gray-400">{inspection.summary.passed} 项通过 · {inspection.summary.warnings} 项提醒 · {inspection.summary.errors} 项错误</p></div></div><button type="button" onClick={() => setInspectionOpen(false)} className="rounded-lg p-2 text-gray-400"><X className="h-5 w-5"/></button></div>
              <div className="mt-4 space-y-2">{inspection.checks.filter((item) => item.level !== 'passed').map((item, index) => <div key={`${item.field}-${index}`} className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${item.level === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{item.level === 'error' ? <CircleX className="mt-0.5 h-4 w-4 shrink-0"/> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>}<div><span className="font-medium">{item.field}</span><p className="mt-0.5 leading-5">{item.message}</p></div></div>)}{inspection.summary.errors === 0 && inspection.summary.warnings === 0 && <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-3 text-sm text-green-700"><CircleCheck className="h-4 w-4"/>日期、系统、位置、施工内容、数量、单位及清单工程量检查均已通过。</div>}</div>
              {inspection.aiReview.enabled && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3"><div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#1E5AA8]"><ShieldCheck className="h-4 w-4"/>AI提示与建议</h3>{inspection.aiReview.model && <span className="text-[10px] text-gray-400">{inspection.aiReview.model}</span>}</div>{inspection.aiReview.items.length ? <div className="mt-2 space-y-2">{inspection.aiReview.items.map((review) => <div key={review.index} className="rounded-lg bg-white p-2.5 text-xs text-gray-600"><p className="font-medium text-gray-700">第{review.index + 1}项 · 内容建议</p>{review.suggestedDescription && <div className="mt-1.5">{review.suggestedDescription}</div>}{review.risks.length > 0 && <div className="mt-1.5 text-gray-500">{review.risks.join('；')}</div>}{review.suggestedDescription && <button type="button" onClick={() => { const target = workItems.filter((item) => item.name.trim())[review.index]; if (!target) return; updateWorkItem(target.key, { name: review.suggestedDescription, code: undefined, bomItemId: null }); setInspectionOpen(false); toast.success('已填入AI建议，请确认后重新检查'); }} className="mt-2 rounded-md bg-[#E8F0FE] px-2 py-1 text-[#1E5AA8]">采用建议并修改</button>}</div>)}</div> : <p className="mt-2 text-xs leading-5 text-gray-500">{inspection.aiReview.notice || '施工内容表达清楚，无需调整'}</p>}<p className="mt-2 text-[10px] leading-4 text-gray-400">AI只判断施工内容是否容易看懂，不审查数量、单位和位置。</p></div>}
              <details className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500"><summary className="cursor-pointer font-medium">本次检查依据</summary><p className="mt-2 leading-5">项目：{currentProject.name}<br/>施工日期：{inspection.source.date}<br/>检查规则：{inspection.source.rules.join('、')}<br/>检查时间：{new Date(inspection.source.checkedAt).toLocaleString('zh-CN')}</p></details>
              <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setInspectionOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm text-gray-600">返回修改</button>{inspection.canSubmit && <button type="button" onClick={() => { setInspectionOpen(false); void handleSubmit(true); }} className="rounded-xl bg-[#1E5AA8] px-4 py-2.5 text-sm font-medium text-white">{inspection.summary.warnings ? '确认无误并提交' : '提交报工'}</button>}</div>
            </section>
          </div>}
        </div>
      )}
    </div>
  );
}
