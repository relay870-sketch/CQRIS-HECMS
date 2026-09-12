// 模拟数据层 - 重庆瑞思施工管理系统

// ============ 类型定义 ============
export interface Project {
  id: string;
  name: string;
  section: string; // 标段
  status: '进行中' | '已完工' | '暂停';
  startDate: string;
  endDate: string;
  description: string;
  manager: string;
  totalWorkers: number;
}

export interface Worker {
  id: string;
  name: string;
  trade: string; // 工种
  team: string; // 班组
  phone: string;
  joinDate: string;
  projectIds: string[];
}

export interface DailyReport {
  id: string;
  projectId: string;
  date: string;
  location: string; // 桩号
  lane: string; // 车道
  devicePoint: string; // 设备点位
  workType: string; // 工作分类
  quantity: number;
  unit: string;
  bomItemId?: string; // 关联清单子目
  workerIds: string[];
  photos: ReportPhoto[];
  weather: string;
  issues: string;
  qualityChecks: string[];
  remarks: string[];
  createdAt: string;
  createdBy: string;
}

export interface ReportPhoto {
  id: string;
  url: string;
  category: '开工前' | '施工中' | '完工后';
}

export interface Document {
  id: string;
  projectId: string;
  folder: string; // 专业分类
  name: string;
  type: '施工图纸' | '工程量清单' | '变更签证' | '其他资料';
  uploadTime: string;
  version: string;
  isObsolete: boolean;
  size: string;
}

export interface BomItem {
  id: string;
  projectId: string;
  code: string;
  name: string;
  unit: string;
  totalQuantity: number;
  completedQuantity: number;
}

// ============ 模拟数据 ============

export const projects: Project[] = [
  {
    id: 'p1',
    name: '山东徐民高速机电工程',
    section: 'SD-XM-1标',
    status: '进行中',
    startDate: '2025-03-15',
    endDate: '2025-12-30',
    description: '山东徐民高速公路机电设备安装工程，包含监控、收费、通信、照明四大系统。',
    manager: '张建国',
    totalWorkers: 28,
  },
  {
    id: 'p2',
    name: '新疆星哈高速机电工程',
    section: 'XJ-XH-2标',
    status: '进行中',
    startDate: '2025-05-01',
    endDate: '2026-03-15',
    description: '新疆星哈高速公路机电设备安装及调试工程，含隧道照明、通风、监控系统。',
    manager: '李明辉',
    totalWorkers: 35,
  },
  {
    id: 'p3',
    name: '普格西宁高速机电工程',
    section: 'PG-XN-1标',
    status: '进行中',
    startDate: '2025-06-10',
    endDate: '2025-11-30',
    description: '普格西宁高速公路日常养护机电系统维修更换工程。',
    manager: '王大伟',
    totalWorkers: 12,
  },
];

export const workers: Worker[] = [
  { id: 'w1', name: '赵强', trade: '电工', team: '一班', phone: '138****5521', joinDate: '2025-03-15', projectIds: ['p1'] },
  { id: 'w2', name: '钱磊', trade: '电工', team: '一班', phone: '139****3312', joinDate: '2025-03-15', projectIds: ['p1'] },
  { id: 'w3', name: '孙伟', trade: '线缆工', team: '二班', phone: '137****8845', joinDate: '2025-03-20', projectIds: ['p1'] },
  { id: 'w4', name: '李军', trade: '线缆工', team: '二班', phone: '136****2267', joinDate: '2025-03-20', projectIds: ['p1', 'p2'] },
  { id: 'w5', name: '周涛', trade: '设备安装工', team: '三班', phone: '135****9901', joinDate: '2025-04-01', projectIds: ['p1'] },
  { id: 'w6', name: '吴刚', trade: '设备安装工', team: '三班', phone: '133****6678', joinDate: '2025-04-01', projectIds: ['p1'] },
  { id: 'w7', name: '郑飞', trade: '调试工程师', team: '调试组', phone: '158****4432', joinDate: '2025-05-01', projectIds: ['p1', 'p2'] },
  { id: 'w8', name: '王磊', trade: '电工', team: '一班', phone: '159****7789', joinDate: '2025-05-01', projectIds: ['p2'] },
  { id: 'w9', name: '冯强', trade: '电工', team: '一班', phone: '150****1123', joinDate: '2025-05-05', projectIds: ['p2'] },
  { id: 'w10', name: '陈明', trade: '线缆工', team: '二班', phone: '151****5567', joinDate: '2025-05-10', projectIds: ['p2'] },
  { id: 'w11', name: '褚亮', trade: '设备安装工', team: '三班', phone: '152****8890', joinDate: '2025-05-10', projectIds: ['p2'] },
  { id: 'w12', name: '卫华', trade: '调试工程师', team: '调试组', phone: '153****3345', joinDate: '2025-05-15', projectIds: ['p2'] },
  { id: 'w13', name: '蒋勇', trade: '电工', team: '一班', phone: '155****6612', joinDate: '2025-06-10', projectIds: ['p3'] },
  { id: 'w14', name: '沈波', trade: '设备安装工', team: '二班', phone: '156****9934', joinDate: '2025-06-15', projectIds: ['p3'] },
  { id: 'w15', name: '韩超', trade: '线缆工', team: '一班', phone: '157****2278', joinDate: '2025-06-10', projectIds: ['p3'] },
];

export const dailyReports: DailyReport[] = [
  {
    id: 'r1', projectId: 'p1', date: '2025-08-16',
    location: 'K12+300', lane: '右侧硬路肩', devicePoint: '监控立柱#15',
    workType: '设备安装', quantity: 2, unit: '台',
    bomItemId: 'b1', workerIds: ['w1', 'w3', 'w5'],
    photos: [
      { id: 'ph1', url: '/placeholder-work.jpg', category: '开工前' },
      { id: 'ph2', url: '/placeholder-work.jpg', category: '施工中' },
    ],
    weather: '晴', issues: '', qualityChecks: ['设备接地已测试', '接线端子已紧固'],
    remarks: [], createdAt: '2025-08-16T17:30:00', createdBy: '赵强',
  },
  {
    id: 'r2', projectId: 'p1', date: '2025-08-16',
    location: 'K12+500~K13+000', lane: '外侧车道', devicePoint: '人孔#22-#25',
    workType: '管道敷设', quantity: 500, unit: '米',
    bomItemId: 'b2', workerIds: ['w2', 'w3', 'w4', 'w6'],
    photos: [
      { id: 'ph3', url: '/placeholder-work.jpg', category: '施工中' },
    ],
    weather: '晴', issues: 'K12+800处遇到地下管线，需协调', qualityChecks: ['管道坡度符合要求', '管道接口密封良好'],
    remarks: [], createdAt: '2025-08-16T17:45:00', createdBy: '钱磊',
  },
  {
    id: 'r3', projectId: 'p1', date: '2025-08-15',
    location: 'K11+800', lane: '中央分隔带', devicePoint: '光缆接续箱#8',
    workType: '线缆穿放', quantity: 2000, unit: '米',
    bomItemId: 'b3', workerIds: ['w3', 'w4', 'w7'],
    photos: [
      { id: 'ph4', url: '/placeholder-work.jpg', category: '施工中' },
      { id: 'ph5', url: '/placeholder-work.jpg', category: '完工后' },
    ],
    weather: '多云', issues: '', qualityChecks: ['线缆标签已粘贴', '线缆弯曲半径达标'],
    remarks: [], createdAt: '2025-08-15T17:20:00', createdBy: '孙伟',
  },
  {
    id: 'r4', projectId: 'p1', date: '2025-08-15',
    location: 'K12+100', lane: '右侧硬路肩', devicePoint: '外场配电箱#5',
    workType: '设备调试', quantity: 1, unit: '套',
    bomItemId: 'b4', workerIds: ['w7', 'w1'],
    photos: [],
    weather: '多云', issues: '配电箱内空开跳闸，已更换', qualityChecks: ['设备接地已测试', '绝缘电阻测试合格'],
    remarks: ['已更换32A空开', '需复查线路绝缘'], createdAt: '2025-08-15T18:00:00', createdBy: '郑飞',
  },
  {
    id: 'r5', projectId: 'p2', date: '2025-08-16',
    location: 'K45+200', lane: '隧道内', devicePoint: '照明灯具L1-L20',
    workType: '设备安装', quantity: 20, unit: '套',
    bomItemId: 'b5', workerIds: ['w8', 'w9', 'w11'],
    photos: [
      { id: 'ph6', url: '/placeholder-work.jpg', category: '施工中' },
    ],
    weather: '阴', issues: '', qualityChecks: ['设备接地已测试', '灯具角度调整到位'],
    remarks: [], createdAt: '2025-08-16T17:00:00', createdBy: '王磊',
  },
  {
    id: 'r6', projectId: 'p2', date: '2025-08-16',
    location: 'K45+500', lane: '隧道内', devicePoint: '风机控制箱FC-03',
    workType: '线缆穿放', quantity: 300, unit: '米',
    bomItemId: 'b6', workerIds: ['w10', 'w4'],
    photos: [],
    weather: '阴', issues: '', qualityChecks: ['线缆标签已粘贴'],
    remarks: [], createdAt: '2025-08-16T17:30:00', createdBy: '陈明',
  },
  {
    id: 'r7', projectId: 'p3', date: '2025-08-16',
    location: 'K88+100', lane: '右侧路肩', devicePoint: '监控摄像机#32',
    workType: '设备安装', quantity: 1, unit: '台',
    bomItemId: 'b7', workerIds: ['w13', 'w14'],
    photos: [
      { id: 'ph7', url: '/placeholder-work.jpg', category: '完工后' },
    ],
    weather: '晴', issues: '', qualityChecks: ['设备接地已测试', '接线端子已紧固', '线缆标签已粘贴'],
    remarks: [], createdAt: '2025-08-16T16:30:00', createdBy: '蒋勇',
  },
  {
    id: 'r8', projectId: 'p1', date: '2025-08-14',
    location: 'K11+200', lane: '中央分隔带', devicePoint: '情报板VMS-03',
    workType: '基础施工', quantity: 1, unit: '个',
    bomItemId: 'b8', workerIds: ['w5', 'w6', 'w1'],
    photos: [
      { id: 'ph8', url: '/placeholder-work.jpg', category: '开工前' },
      { id: 'ph9', url: '/placeholder-work.jpg', category: '施工中' },
      { id: 'ph10', url: '/placeholder-work.jpg', category: '完工后' },
    ],
    weather: '晴', issues: '', qualityChecks: ['基础尺寸符合图纸', '预埋件位置准确'],
    remarks: [], createdAt: '2025-08-14T17:00:00', createdBy: '周涛',
  },
];

export const documents: Document[] = [
  { id: 'd1', projectId: 'p1', folder: '监控系统', name: '外场监控设备布置图', type: '施工图纸', uploadTime: '2025-03-20', version: 'V2.0', isObsolete: false, size: '12.5MB' },
  { id: 'd2', projectId: 'p1', folder: '监控系统', name: '外场监控设备布置图', type: '施工图纸', uploadTime: '2025-03-10', version: 'V1.0', isObsolete: true, size: '10.2MB' },
  { id: 'd3', projectId: 'p1', folder: '收费系统', name: '收费站设备安装图', type: '施工图纸', uploadTime: '2025-04-05', version: 'V1.1', isObsolete: false, size: '8.7MB' },
  { id: 'd4', projectId: 'p1', folder: '通信系统', name: '光缆路由图', type: '施工图纸', uploadTime: '2025-03-25', version: 'V1.0', isObsolete: false, size: '15.3MB' },
  { id: 'd5', projectId: 'p1', folder: '监控系统', name: 'G50改扩建机电工程量清单', type: '工程量清单', uploadTime: '2025-03-15', version: 'V1.0', isObsolete: false, size: '2.1MB' },
  { id: 'd6', projectId: 'p1', folder: '监控系统', name: '监控立柱安装作业指导书', type: '其他资料', uploadTime: '2025-04-01', version: 'V1.0', isObsolete: false, size: '1.5MB' },
  { id: 'd7', projectId: 'p1', folder: '收费系统', name: '设计变更通知单-001', type: '变更签证', uploadTime: '2025-05-10', version: 'V1.0', isObsolete: false, size: '0.8MB' },
  { id: 'd8', projectId: 'p2', folder: '照明系统', name: '隧道照明布置图', type: '施工图纸', uploadTime: '2025-05-15', version: 'V1.2', isObsolete: false, size: '18.6MB' },
  { id: 'd9', projectId: 'p2', folder: '隧道机电', name: '隧道风机安装图', type: '施工图纸', uploadTime: '2025-05-20', version: 'V1.0', isObsolete: false, size: '9.4MB' },
  { id: 'd10', projectId: 'p2', folder: '照明系统', name: '隧道照明工程量清单', type: '工程量清单', uploadTime: '2025-05-10', version: 'V1.0', isObsolete: false, size: '1.8MB' },
  { id: 'd11', projectId: 'p2', folder: '隧道机电', name: '隧道机电综合管线图', type: '施工图纸', uploadTime: '2025-06-01', version: 'V1.1', isObsolete: false, size: '22.3MB' },
  { id: 'd12', projectId: 'p3', folder: '监控系统', name: '养护段监控设备更换清单', type: '工程量清单', uploadTime: '2025-06-15', version: 'V1.0', isObsolete: false, size: '0.9MB' },
];

export const bomItems: BomItem[] = [
  // G50项目清单
  { id: 'b1', projectId: 'p1', code: 'JK-001', name: '高清球型摄像机安装', unit: '台', totalQuantity: 45, completedQuantity: 32 },
  { id: 'b2', projectId: 'p1', code: 'TX-001', name: 'HDPE管道敷设(φ100)', unit: '米', totalQuantity: 8500, completedQuantity: 5200 },
  { id: 'b3', projectId: 'p1', code: 'TX-002', name: '光缆穿放(24芯)', unit: '米', totalQuantity: 15000, completedQuantity: 9800 },
  { id: 'b4', projectId: 'p1', code: 'JK-002', name: '外场配电箱安装调试', unit: '套', totalQuantity: 12, completedQuantity: 8 },
  { id: 'b5', projectId: 'p1', code: 'JK-003', name: '可变情报板安装', unit: '套', totalQuantity: 6, completedQuantity: 3 },
  { id: 'b6', projectId: 'p1', code: 'TX-003', name: '电缆穿放(YJV-5×16)', unit: '米', totalQuantity: 12000, completedQuantity: 7500 },
  { id: 'b7', projectId: 'p1', code: 'JK-004', name: '基础施工(监控立柱)', unit: '个', totalQuantity: 20, completedQuantity: 14 },
  { id: 'b8', projectId: 'p1', code: 'JK-005', name: '监控立柱组立', unit: '根', totalQuantity: 20, completedQuantity: 12 },
  // S12项目清单
  { id: 'b9', projectId: 'p2', code: 'ZM-001', name: 'LED隧道灯安装', unit: '套', totalQuantity: 680, completedQuantity: 320 },
  { id: 'b10', projectId: 'p2', code: 'ZM-002', name: '照明配电箱安装', unit: '台', totalQuantity: 24, completedQuantity: 16 },
  { id: 'b11', projectId: 'p2', code: 'SD-001', name: '射流风机安装', unit: '台', totalQuantity: 36, completedQuantity: 18 },
  { id: 'b12', projectId: 'p2', code: 'TX-010', name: '风机电缆敷设', unit: '米', totalQuantity: 5400, completedQuantity: 2100 },
  // G3项目清单
  { id: 'b13', projectId: 'p3', code: 'YH-001', name: '摄像机更换', unit: '台', totalQuantity: 15, completedQuantity: 8 },
  { id: 'b14', projectId: 'p3', code: 'YH-002', name: '线缆更换', unit: '米', totalQuantity: 3000, completedQuantity: 1200 },
];

// ============ 辅助函数 ============

export function getProjectById(id: string): Project | undefined {
  return projects.find(p => p.id === id);
}

export function getWorkersByProject(projectId: string): Worker[] {
  return workers.filter(w => w.projectIds.includes(projectId));
}

export function getReportsByProject(projectId: string): DailyReport[] {
  return dailyReports.filter(r => r.projectId === projectId);
}

export function getReportsByDate(date: string): DailyReport[] {
  return dailyReports.filter(r => r.date === date);
}

export function getDocumentsByProject(projectId: string): Document[] {
  return documents.filter(d => d.projectId === projectId);
}

export function getBomByProject(projectId: string): BomItem[] {
  return bomItems.filter(b => b.projectId === projectId);
}

export function getWorkerById(id: string): Worker | undefined {
  return workers.find(w => w.id === id);
}

export function getTodayReportCount(projectId?: string): number {
  let reports = dailyReports.filter(r => r.date === '2025-08-16');
  if (projectId) reports = reports.filter(r => r.projectId === projectId);
  return reports.length;
}

export function getTodayWorkerCount(projectId?: string): number {
  let todayReports = dailyReports.filter(r => r.date === '2025-08-16');
  if (projectId) todayReports = todayReports.filter(r => r.projectId === projectId);
  const workerIds = new Set<string>();
  todayReports.forEach(r => r.workerIds.forEach(id => workerIds.add(id)));
  return workerIds.size;
}

export function getActiveProjectCount(): number {
  return projects.filter(p => p.status === '进行中').length;
}

export const workTypes = ['管道敷设', '线缆穿放', '设备安装', '设备调试', '基础施工', '其他'];

export const qualityCheckItems = [
  '设备接地已测试',
  '线缆标签已粘贴',
  '接线端子已紧固',
  '绝缘电阻测试合格',
  '管道坡度符合要求',
  '管道接口密封良好',
  '线缆弯曲半径达标',
  '基础尺寸符合图纸',
  '预埋件位置准确',
  '灯具角度调整到位',
  '防水处理已完成',
  '设备外观无损伤',
];

export const weatherOptions = ['晴', '多云', '阴', '小雨', '中雨', '大雨', '雪', '雾'];

export const unitOptions = ['米', '台', '套', '个', '根', '处', '组'];
