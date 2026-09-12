import { getDb, initDbWithSeed } from '@/lib/db';

initDbWithSeed();

interface ProjectRow { id: string; name: string; section: string; manager: string; status: string; progress: number }
interface ReportRow {
  id: string; project_id: string; date: string; location: string; work_type: string; quantity: number; unit: string;
  workers: string; weather: string | null; notes: string | null; issue: string | null; photos: string; submitter: string;
  created_at: string; work_items: string | null; system: string | null;
}
interface AttendanceRow { project_id: string; worker_id: string; attendance: 'full' | 'half' | 'absent'; overtime_hours: number }
interface BoardWorkItem {
  name: string; code: string; location: string; quantity: number; unit: string; attendance: string;
  overtimeHours: number; contractOutside: boolean; workers: string[];
}

function parseArray(value: string | null): unknown[] {
  try { const parsed: unknown = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function workerIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

function parseItems(report: ReportRow, names: Map<string, string>): BoardWorkItem[] {
  const reportWorkers = workerIds(parseArray(report.workers));
  const parsed = parseArray(report.work_items).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  const items = parsed.length > 0 ? parsed : [{ name: report.work_type, quantity: report.quantity, unit: report.unit, location: report.location, workers: reportWorkers }];
  return items.map((item) => {
    const ids = workerIds(item.workers).length > 0 ? workerIds(item.workers) : reportWorkers;
    return {
      name: typeof item.name === 'string' ? item.name : report.work_type,
      code: typeof item.code === 'string' ? item.code : '',
      location: typeof item.location === 'string' ? item.location : report.location,
      quantity: typeof item.quantity === 'number' ? item.quantity : report.quantity,
      unit: typeof item.unit === 'string' ? item.unit : report.unit,
      attendance: item.attendance === 'half' ? '半天' : item.attendance === 'none' ? '仅计量' : '全天',
      overtimeHours: typeof item.overtimeHours === 'number' ? item.overtimeHours : 0,
      contractOutside: item.external === true,
      workers: ids.map((id) => names.get(id) || '已离场人员'),
    };
  });
}

export function chinaDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function getPublicBoardData(date = chinaDate(), projectId = '') {
  const db = getDb();
  const availableProjects = db.prepare(`SELECT id, name, section, manager, status, progress FROM projects
    ORDER BY status = 'in_progress' DESC, created_at`).all() as ProjectRow[];
  const projects = projectId ? availableProjects.filter((project) => project.id === projectId) : availableProjects;
  const projectIds = new Set(projects.map((project) => project.id));
  const reports = (db.prepare(`SELECT id, project_id, date, location, work_type, quantity, unit, workers, weather, notes, issue,
    photos, submitter, created_at, work_items, system FROM reports
    ${projectId ? 'WHERE project_id = ?' : ''} ORDER BY date DESC, created_at DESC LIMIT 100`).all(...(projectId ? [projectId] : [])) as ReportRow[])
    .filter((report) => projectIds.has(report.project_id));
  const workerRows = db.prepare('SELECT id, name FROM workers').all() as Array<{ id: string; name: string }>;
  const names = new Map(workerRows.map((worker) => [worker.id, worker.name]));
  const attendance = db.prepare(`SELECT project_id, worker_id, attendance, overtime_hours FROM daily_attendance
    WHERE date = ? ${projectId ? 'AND project_id = ?' : ''}`).all(...(projectId ? [date, projectId] : [date])) as AttendanceRow[];
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  const history = reports.map((report) => {
    const items = parseItems(report, names);
    const photos = parseArray(report.photos);
    return {
      id: report.id,
      date: report.date,
      projectId: report.project_id,
      projectName: projectNames.get(report.project_id) || '',
      system: report.system || '未分类',
      weather: report.weather || '未填写',
      locations: [...new Set(items.map((item) => item.location))],
      items,
      workerNames: [...new Set(items.flatMap((item) => item.workers))],
      contractOutsideCount: items.filter((item) => item.contractOutside).length,
      overtimePersonHours: items.reduce((sum, item) => sum + item.overtimeHours * item.workers.length, 0),
      photoCount: photos.length,
      siteNotes: report.notes || report.issue || '',
      submitter: report.submitter,
      submittedAt: report.created_at,
    };
  });
  const targetRecords = history.filter((record) => record.date === date);
  const attendancePresent = attendance.filter((row) => row.attendance !== 'absent');
  const targetWorkerNames = attendancePresent.length > 0
    ? [...new Set(attendancePresent.map((row) => names.get(row.worker_id) || '已离场人员'))]
    : [...new Set(targetRecords.flatMap((record) => record.workerNames))];
  const overtimePersonHours = attendancePresent.length > 0
    ? attendancePresent.reduce((sum, row) => sum + row.overtime_hours, 0)
    : targetRecords.reduce((sum, record) => sum + record.overtimePersonHours, 0);
  const targetItems = targetRecords.flatMap((record) => record.items);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Shanghai',
    reportDate: date,
    privacy: '公开只读；不包含手机号、账号、密码和照片地址',
    summary: {
      projectCount: new Set(targetRecords.map((record) => record.projectId)).size,
      reportCount: targetRecords.length,
      workItemCount: targetItems.length,
      attendanceCount: targetWorkerNames.length,
      attendanceNames: targetWorkerNames,
      overtimePersonHours,
      contractOutsideCount: targetItems.filter((item) => item.contractOutside).length,
      photoCount: targetRecords.reduce((sum, record) => sum + record.photoCount, 0),
    },
    availableProjects,
    projects,
    targetRecords,
    history,
  };
}
