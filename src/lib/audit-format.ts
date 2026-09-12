const FIELD_NAMES: Record<string, string> = {
  id: '内部编号', project_id: '所属项目', projectId: '所属项目', date: '日期', system: '所属系统',
  name: '名称', code: '清单编号', unit: '单位', quantity: '完成数量', total_qty: '合同数量',
  completed_qty: '已完成数量', unit_price: '单价', location: '施工位置', work_type: '施工内容',
  workItems: '施工内容明细', work_items: '施工内容明细', workers: '参与人员', weather: '天气',
  notes: '现场说明', issue: '问题与异常', photoCount: '照片数量', role: '账号角色', status: '账号状态',
  displayName: '姓名', display_name: '姓名', username: '登录姓名', team: '班组', phone: '联系电话',
  join_date: '进场日期', start_date: '开始日期', end_date: '结束日期', manager: '项目负责人',
  progress: '项目进度', section: '标段', attendance: '出勤状态', overtimeHours: '加班小时',
  external: '合同外施工', bomItemId: '清单子目', created: '新增数量', updated: '更新数量',
  total: '合计', size: '文件大小', category: '资料分类', ipAddress: 'IP地址', reason: '原因',
  blocked: '封禁状态', failedAttempts: '密码错误次数', blockedBy: '封禁人', before_qty: '调整前数量',
  after_qty: '调整后数量', delta_qty: '调整数量', operator: '操作人', submitter: '提交人',
  created_at: '创建时间', updated_at: '更新时间', photos: '照片', storage_uri: '存储位置', content: '文档内容',
};

const HIDDEN_FIELDS = new Set(['id', 'project_id', 'projectId', 'bomItemId', 'storage_uri', 'content', 'password_hash']);

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '无';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return String(value);
  const text = String(value);
  const valueNames: Record<string, string> = { full: '全天', half: '半天', none: '不计出勤', absent: '未出勤',
    admin: '管理员', reporter: '报工人员', viewer: '只读人员', active: '已启用', pending: '待审核',
    disabled: '已停用', in_progress: '施工中', completed: '已完工', suspended: '已暂停' };
  return valueNames[text] || text;
}

function formatNode(value: unknown, indent = ''): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}无`];
    if (value.every((item) => typeof item !== 'object' || item === null)) return [`${indent}${value.map(displayValue).join('、')}`];
    return value.flatMap((item, index) => [`${indent}第${index + 1}项：`, ...formatNode(item, `${indent}  `)]);
  }
  if (value && typeof value === 'object') {
    const lines: string[] = [];
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (HIDDEN_FIELDS.has(key) || item === undefined) continue;
      const label = FIELD_NAMES[key] || key.replaceAll('_', ' ');
      if (item && typeof item === 'object') {
        lines.push(`${indent}${label}：`, ...formatNode(item, `${indent}  `));
      } else {
        lines.push(`${indent}${label}：${displayValue(item)}`);
      }
    }
    return lines.length ? lines : [`${indent}无`];
  }
  return [`${indent}${displayValue(value)}`];
}

export function formatAuditData(value: unknown): string {
  return formatNode(value).join('\n').slice(0, 50_000);
}

export function formatStoredAuditData(value: string | null): string {
  if (!value) return '';
  try { return formatAuditData(JSON.parse(value) as unknown); }
  catch { return value; }
}
