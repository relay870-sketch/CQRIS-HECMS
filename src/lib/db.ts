import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

// Database file path - 统一使用项目目录下的 data/，保证生产环境数据持久化
const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'construction.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Initialize schema
    initSchema(db);
    // Apply incremental migrations for existing databases
    migrateSchema(db);
  }
  return db;
}

/** 在整库恢复前安全关闭连接；下次 getDb() 会重新打开并执行迁移。 */
export function closeDb(): void {
  if (!db) return;
  db.close();
  db = null;
}

/**
 * 增量迁移：为已存在的数据库补充新增列/数据
 */
function migrateSchema(db: Database.Database): void {
  // SOP 功能已下线，清除旧版本遗留的数据表和数据。
  db.exec('DROP TABLE IF EXISTS sops');
  db.exec("UPDATE documents SET type = 'other' WHERE type = 'sop'");
  db.exec("UPDATE knowledge_documents SET type = 'other' WHERE type = 'sop'");
  db.prepare(`INSERT OR IGNORE INTO accounts
    (id, username, display_name, password_hash, role, status)
    VALUES ('account-admin', 'admin', '管理员', NULL, 'admin', 'active')`).run();

  const projectTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get() as
    | { sql: string }
    | undefined;
  if (projectTable && !projectTable.sql.includes("'suspended'")) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE projects_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          section TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('in_progress', 'completed', 'suspended')),
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          manager TEXT NOT NULL,
          progress INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO projects_new SELECT * FROM projects;
        DROP TABLE projects;
        ALTER TABLE projects_new RENAME TO projects;
      `);
    })();
    db.pragma('foreign_keys = ON');
  }

  // documents 表增加 content 列（用于本地关键词检索）
  const docCols = db.prepare('PRAGMA table_info(documents)').all() as { name: string }[];
  if (!docCols.some(c => c.name === 'content')) {
    db.exec('ALTER TABLE documents ADD COLUMN content TEXT');
  }
  // 为历史文档（含种子数据）回填可检索的元数据内容
  db.prepare(
    "UPDATE documents SET content = '[文档] ' || name || ' 分类：' || category WHERE content IS NULL"
  ).run();

  // reports 表增加 work_items 列（一条报工可包含多条施工内容明细）
  const reportCols = db.prepare('PRAGMA table_info(reports)').all() as { name: string }[];
  if (!reportCols.some(c => c.name === 'work_items')) {
    db.exec('ALTER TABLE reports ADD COLUMN work_items TEXT');
  }

  // bom_items 增加 system 列（所属子系统）
  const bomCols = db.prepare('PRAGMA table_info(bom_items)').all() as { name: string }[];
  if (!bomCols.some(c => c.name === 'system')) {
    db.exec('ALTER TABLE bom_items ADD COLUMN system TEXT');
  }
  if (!bomCols.some(c => c.name === 'unit_price')) {
    db.exec('ALTER TABLE bom_items ADD COLUMN unit_price REAL NOT NULL DEFAULT 0');
  }

  // reports 增加 system 列（报工所属子系统）
  const reportCols2 = db.prepare('PRAGMA table_info(reports)').all() as { name: string }[];
  if (!reportCols2.some(c => c.name === 'system')) {
    db.exec('ALTER TABLE reports ADD COLUMN system TEXT');
  }

  if (!reportCols2.some(c => c.name === 'tomorrow_plan')) {
    db.exec('ALTER TABLE reports ADD COLUMN tomorrow_plan TEXT');
  }
  if (!reportCols2.some(c => c.name === 'tomorrow_location')) {
    db.exec('ALTER TABLE reports ADD COLUMN tomorrow_location TEXT');
  }

  // 首次为项目创建默认子系统，并把现有清单归属到默认系统
  const sysCount = db.prepare('SELECT COUNT(*) c FROM project_systems').get() as { c: number };
  if (sysCount.c === 0) {
    const projects = db.prepare('SELECT id, name FROM projects').all() as Array<{ id: string; name: string }>;
    const insertSys = db.prepare(
      'INSERT INTO project_systems (id, project_id, name, sort_order) VALUES (?, ?, ?, ?)'
    );

    db.transaction((list: Array<{ id: string; name: string }>) => {
      for (const p of list) {
        let order = 0;
        insertSys.run(randomUUID(), p.id, '监控系统', order++);
        // 名称含"西宁/宁南"的项目补充"隧道监控"（可后续在管理页自行调整）
        if (/西宁|宁南/.test(p.name)) {
          insertSys.run(randomUUID(), p.id, '隧道监控', order);
        }
      }
    })(projects);

    // 现有清单子目归属到项目的第一个系统
    const items = db.prepare("SELECT id, project_id FROM bom_items WHERE system IS NULL OR system = ''").all() as
      | Array<{ id: string; project_id: string }>
      | [];
    for (const it of items) {
      const sys = db.prepare('SELECT name FROM project_systems WHERE project_id = ? ORDER BY sort_order LIMIT 1').get(it.project_id) as
        | { name: string }
        | undefined;
      if (sys) {
        db.prepare('UPDATE bom_items SET system = ? WHERE id = ?').run(sys.name, it.id);
      }
    }
  }

  // 独立考勤表上线前，考勤仅保存在报工记录的 JSON 中。
  // 仅补齐缺失行，避免覆盖管理员在“考勤管理”中做过的人工修正。
  backfillAttendanceFromReports(db);
}

type HistoricalReport = {
  id: string;
  project_id: string;
  date: string;
  workers: string;
  work_items: string | null;
};

type HistoricalWorkItem = {
  attendance?: unknown;
  overtimeHours?: unknown;
  workers?: unknown;
};

function parseWorkerIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((workerId): workerId is string => typeof workerId === 'string' && workerId.length > 0);
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function backfillAttendanceFromReports(db: Database.Database): void {
  const reports = db.prepare(`
    SELECT id, project_id, date, workers, work_items
    FROM reports
    ORDER BY date, created_at, id
  `).all() as HistoricalReport[];
  const validWorkers = new Set(
    (db.prepare('SELECT project_id, id FROM workers').all() as Array<{ project_id: string; id: string }>)
      .map((worker) => `${worker.project_id}\u0000${worker.id}`)
  );
  const attendance = new Map<string, {
    projectId: string;
    workerId: string;
    date: string;
    status: 'full' | 'half';
    overtimeHours: number;
    reportId: string;
  }>();

  for (const report of reports) {
    const reportWorkers = parseWorkerIds(parseJson(report.workers));
    const parsedItems = parseJson(report.work_items);
    const items: HistoricalWorkItem[] = Array.isArray(parsedItems) && parsedItems.length > 0
      ? parsedItems.filter((item): item is HistoricalWorkItem => typeof item === 'object' && item !== null)
      : [{ attendance: 'full', overtimeHours: 0, workers: reportWorkers }];

    for (const item of items) {
      if (item.attendance === 'none' || item.attendance === 'absent') continue;
      const status: 'full' | 'half' = item.attendance === 'half' ? 'half' : 'full';
      const rawOvertime = Number(item.overtimeHours ?? 0);
      const overtimeHours = Number.isFinite(rawOvertime) && rawOvertime > 0 ? Math.min(rawOvertime, 24) : 0;
      const itemWorkers = parseWorkerIds(item.workers);
      const workers = itemWorkers.length > 0 ? itemWorkers : reportWorkers;

      for (const workerId of workers) {
        if (!validWorkers.has(`${report.project_id}\u0000${workerId}`)) continue;
        const key = `${report.project_id}\u0000${report.date}\u0000${workerId}`;
        const current = attendance.get(key);
        attendance.set(key, {
          projectId: report.project_id,
          workerId,
          date: report.date,
          status: current?.status === 'full' || status === 'full' ? 'full' : 'half',
          overtimeHours: Math.max(current?.overtimeHours ?? 0, overtimeHours),
          reportId: report.id,
        });
      }
    }
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO daily_attendance
      (id, project_id, worker_id, date, attendance, overtime_hours, source_report_id, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '系统同步', datetime('now'))
  `);
  db.transaction(() => {
    for (const entry of attendance.values()) {
      insert.run(
        randomUUID(), entry.projectId, entry.workerId, entry.date,
        entry.status, entry.overtimeHours, entry.reportId
      );
    }
  })();
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- 系统登录账号（管理员首次登录时设置密码，注册账号需审核）
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin', 'reporter', 'viewer')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'disabled')) DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      reviewed_by TEXT
    );

    -- 登录 IP 防护：连续密码错误自动封禁，也支持管理员手动维护黑名单
    CREATE TABLE IF NOT EXISTS auth_ip_security (
      ip_address TEXT PRIMARY KEY,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      last_failed_at TEXT,
      blocked INTEGER NOT NULL DEFAULT 0,
      blocked_reason TEXT,
      blocked_at TEXT,
      blocked_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 项目表
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      section TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('in_progress', 'completed', 'suspended')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      manager TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 人员表
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      team TEXT NOT NULL,
      phone TEXT NOT NULL,
      join_date TEXT NOT NULL,
      project_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 施工报工记录表
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT NOT NULL,
      lane TEXT,
      device_point TEXT,
      work_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      bom_item_id TEXT,
      workers TEXT NOT NULL, -- JSON array of worker IDs
      weather TEXT,
      issue TEXT,
      quality_checks TEXT NOT NULL, -- JSON array of checked items
      photos TEXT NOT NULL, -- JSON array of photo objects
      notes TEXT,
      tomorrow_plan TEXT,
      tomorrow_location TEXT,
      submitter TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (bom_item_id) REFERENCES bom_items(id) ON DELETE SET NULL
    );

    -- 工程量清单表
    CREATE TABLE IF NOT EXISTS bom_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      total_qty REAL NOT NULL,
      completed_qty REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 工程量人工调整流水：日报贡献与人工修正分开留痕
    CREATE TABLE IF NOT EXISTS bom_adjustments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      bom_item_id TEXT NOT NULL,
      before_qty REAL NOT NULL,
      after_qty REAL NOT NULL,
      delta_qty REAL NOT NULL,
      reason TEXT NOT NULL,
      operator TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (bom_item_id) REFERENCES bom_items(id) ON DELETE CASCADE
    );

    -- 每日独立考勤：不再依赖施工条目推算出勤
    CREATE TABLE IF NOT EXISTS daily_attendance (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,
      date TEXT NOT NULL,
      attendance TEXT NOT NULL CHECK(attendance IN ('full', 'half', 'absent')),
      overtime_hours REAL NOT NULL DEFAULT 0,
      source_report_id TEXT,
      updated_by TEXT NOT NULL DEFAULT '管理员',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, worker_id, date),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
      FOREIGN KEY (source_report_id) REFERENCES reports(id) ON DELETE SET NULL
    );

    -- 关键管理操作审计
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT NOT NULL,
      operator TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 已归档操作日志（默认保留一年在线日志）
    CREATE TABLE IF NOT EXISTS audit_log_archive (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT NOT NULL,
      operator TEXT NOT NULL,
      created_at TEXT,
      operator_id TEXT,
      module TEXT NOT NULL DEFAULT 'system',
      result TEXT NOT NULL DEFAULT 'success',
      ip_address TEXT,
      user_agent TEXT,
      before_data TEXT,
      after_data TEXT,
      device_type TEXT,
      browser TEXT,
      archived_at TEXT DEFAULT (datetime('now'))
    );

    -- 文档表
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('drawing', 'bill', 'change', 'sop', 'other')),
      category TEXT NOT NULL,
      version TEXT NOT NULL,
      upload_date TEXT NOT NULL,
      is_latest INTEGER NOT NULL DEFAULT 1,
      project_id TEXT NOT NULL,
      storage_uri TEXT,
      file_size INTEGER,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 知识库文档表
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      upload_date TEXT NOT NULL,
      project_id TEXT NOT NULL,
      storage_uri TEXT,
      knowledge_index_id TEXT,
      file_size INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 项目桩号/位置表（后台统一录入，报工时联想）
    CREATE TABLE IF NOT EXISTS project_locations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 从联想列表中隐藏的历史桩号（不影响原报工记录）
    CREATE TABLE IF NOT EXISTS project_location_exclusions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, name),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- AI 问答记忆表（按项目永久存储）
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- AI 项目长期记忆：由模型从对话中提取并按类别持续更新
    CREATE TABLE IF NOT EXISTS project_memories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('facts', 'preferences', 'open_issues', 'decisions')),
      content TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, category),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bom_match_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      query_text TEXT NOT NULL,
      bom_item_id TEXT NOT NULL,
      confirm_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, query_text, bom_item_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (bom_item_id) REFERENCES bom_items(id) ON DELETE CASCADE
    );

    -- 系统级配置（敏感值由业务层加密后保存）
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      profile_id TEXT,
      model TEXT NOT NULL,
      task_type TEXT NOT NULL,
      success INTEGER NOT NULL,
      fallback_used INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs(created_at);

    -- 项目子系统表（如 收费系统/监控系统/通信系统/供配电系统/隧道监控 等）
    CREATE TABLE IF NOT EXISTS project_systems (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 创建索引
    CREATE INDEX IF NOT EXISTS idx_workers_project ON workers(project_id);
    CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_id);
    CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);
    CREATE INDEX IF NOT EXISTS idx_reports_project_date_created ON reports(project_id, date DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_project_system_date ON reports(project_id, system, date DESC);
    CREATE INDEX IF NOT EXISTS idx_bom_project ON bom_items(project_id);
    CREATE INDEX IF NOT EXISTS idx_bom_adjustments_item ON bom_adjustments(bom_item_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_attendance_project_date ON daily_attendance(project_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_project_worker_date ON daily_attendance(project_id, worker_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_project_date ON audit_logs(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_documents_project ON knowledge_documents(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_locations_project ON project_locations(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_location_exclusions_project ON project_location_exclusions(project_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_memories_project ON project_memories(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_systems_project ON project_systems(project_id);
    CREATE INDEX IF NOT EXISTS idx_auth_ip_blocked ON auth_ip_security(blocked, updated_at);
  `);

  const auditColumns = db.prepare('PRAGMA table_info(audit_logs)').all() as Array<{ name: string }>;
  const auditMigrations = [
    ['operator_id', 'TEXT'], ['module', "TEXT NOT NULL DEFAULT 'system'"],
    ['result', "TEXT NOT NULL DEFAULT 'success'"], ['ip_address', 'TEXT'],
    ['user_agent', 'TEXT'], ['before_data', 'TEXT'], ['after_data', 'TEXT'],
    ['device_type', 'TEXT'], ['browser', 'TEXT'],
  ] as const;
  for (const [name, definition] of auditMigrations) {
    if (!auditColumns.some((column) => column.name === name)) {
      try {
        db.exec(`ALTER TABLE audit_logs ADD COLUMN ${name} ${definition}`);
      } catch (error) {
        // Next.js 构建/启动时可能由多个 worker 同时初始化；另一 worker 已完成同一迁移即可忽略。
        if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error;
      }
    }
  }
  // 启动时自动归档一年前的日志；事务保证迁移过程中不会出现重复或丢失。
  db.transaction(() => {
    db.exec(`INSERT OR IGNORE INTO audit_log_archive
      (id, project_id, action, entity_type, entity_id, detail, operator, created_at, operator_id, module,
       result, ip_address, user_agent, before_data, after_data, device_type, browser)
      SELECT id, project_id, action, entity_type, entity_id, detail, operator, created_at, operator_id, module,
       result, ip_address, user_agent, before_data, after_data, device_type, browser
      FROM audit_logs WHERE created_at < datetime('now', '-1 year')`);
    db.exec(`DELETE FROM audit_logs WHERE created_at < datetime('now', '-1 year')`);
  })();
}

// Initialize database with seed data
export function initDbWithSeed(): void {
  const db = getDb();
  
  // Check if data already exists
  const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
  if (projectCount.count > 0) {
    return; // Data already seeded
  }

  // Seed projects
  const insertProject = db.prepare(`
    INSERT INTO projects (id, name, section, status, start_date, end_date, manager, progress)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertProject.run('p1', '山东徐民高速机电工程', '徐民段K0+000~K42+500', 'in_progress', '2024-03-15', '2025-06-30', '张建国', 62);
  insertProject.run('p2', '新疆星哈高速机电工程', '星哈段K120+000~K185+000', 'in_progress', '2024-05-01', '2025-09-30', '李明远', 38);
  insertProject.run('p3', '普格西宁高速机电工程', '普格段K55+200~K98+800', 'in_progress', '2024-08-20', '2025-12-31', '王德胜', 15);

  // Seed workers
  const insertWorker = db.prepare(`
    INSERT INTO workers (id, name, role, team, phone, join_date, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const workers = [
    ['w1', '赵大勇', '代班', '一组', '138****5521', '2024-03-18', 'p1'],
    ['w2', '钱小明', '电工', '一组', '139****3312', '2024-03-18', 'p1'],
    ['w3', '孙建设', '管道工', '二组', '137****8845', '2024-04-01', 'p1'],
    ['w4', '李国强', '代班', '二组', '136****6623', '2024-04-01', 'p1'],
    ['w5', '周文斌', '调试员', '三组', '135****4478', '2024-05-10', 'p1'],
    ['w6', '吴志远', '电工', '三组', '134****2290', '2024-05-10', 'p1'],
    ['w7', '郑海峰', '代班', '一组', '133****1156', '2024-05-05', 'p2'],
    ['w8', '王建华', '电工', '一组', '132****7734', '2024-05-05', 'p2'],
    ['w9', '冯国强', '管道工', '二组', '131****9987', '2024-06-01', 'p2'],
    ['w10', '陈小明', '调试员', '二组', '130****5543', '2024-06-15', 'p2'],
    ['w11', '杨大伟', '代班', '一组', '158****3321', '2024-08-25', 'p3'],
    ['w12', '刘建设', '电工', '一组', '159****6678', '2024-08-25', 'p3'],
    ['w13', '黄志明', '管道工', '二组', '157****4412', '2024-09-01', 'p3'],
    ['w14', '马国强', '调试员', '二组', '156****8856', '2024-09-15', 'p3'],
  ];

  for (const w of workers) {
    insertWorker.run(...w);
  }

  // Seed BOM items
  const insertBom = db.prepare(`
    INSERT INTO bom_items (id, project_id, code, name, unit, total_qty, completed_qty)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const bomItems = [
    ['b1', 'p1', 'JK-001', '监控立柱安装', '套', 86, 58],
    ['b2', 'p1', 'JK-002', '高清球机安装', '台', 42, 28],
    ['b3', 'p1', 'TX-001', '光缆敷设(48芯)', '米', 42500, 31200],
    ['b4', 'p1', 'SF-001', '情报板安装', '套', 6, 4],
    ['b5', 'p1', 'SD-001', '管道敷设(PE110)', '米', 18000, 12500],
    ['b6', 'p2', 'JK-001', '监控立柱安装', '套', 120, 48],
    ['b7', 'p2', 'TX-001', '光缆敷设(48芯)', '米', 65000, 22000],
    ['b8', 'p2', 'ZM-001', '隧道LED灯具安装', '套', 680, 245],
    ['b9', 'p2', 'SF-001', 'ETC门架安装', '套', 8, 3],
    ['b10', 'p3', 'JK-001', '监控立柱安装', '套', 95, 12],
    ['b11', 'p3', 'TX-001', '光缆敷设(48芯)', '米', 43600, 5800],
    ['b12', 'p3', 'SD-001', '管道敷设(PE110)', '米', 22000, 2800],
    ['b13', 'p3', 'ZM-001', '照明配电箱安装', '台', 16, 2],
  ];

  for (const b of bomItems) {
    insertBom.run(...b);
  }

  // Seed reports
  const insertReport = db.prepare(`
    INSERT INTO reports (id, project_id, date, location, lane, device_point, work_type, quantity, unit, bom_item_id, workers, weather, issue, quality_checks, photos, notes, submitter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const reports = [
    ['r1', 'p1', '2026-08-16', 'K12+300', '超车道', '监控点M-12', '设备安装', 2, '台', 'b2', '["w1","w2"]', '晴', null, '["ground_test","label"]', '[]', null, '赵大勇'],
    ['r2', 'p1', '2026-08-16', 'K15+800', '应急车道', '管道段P-08', '管道敷设', 200, '米', 'b5', '["w3","w4"]', '晴', null, '["depth","compaction"]', '[]', null, '孙建设'],
    ['r3', 'p1', '2026-08-15', 'K18+500', '行车道', '监控点M-18', '线缆穿放', 500, '米', 'b3', '["w5","w6"]', '多云', null, '["label","waterproof"]', '[]', null, '周文斌'],
    ['r4', 'p2', '2026-08-16', 'K135+200', '超车道', '监控点X-35', '设备安装', 3, '套', 'b6', '["w7","w8"]', '晴', null, '["ground_test","vertical","label"]', '[]', null, '郑海峰'],
    ['r5', 'p2', '2026-08-15', 'K142+000', '应急车道', null, '线缆穿放', 800, '米', 'b7', '["w9","w10"]', '多云', 'K142+100处遇到岩石层，需调整方案', '["label","waterproof"]', '[]', '遇到岩石层需变更', '冯国强'],
    ['r6', 'p3', '2026-08-16', 'K60+100', '超车道', '监控点N-05', '基础施工', 4, '个', 'b10', '["w11","w12"]', '晴', null, '["curing","rebar","ground"]', '[]', null, '杨大伟'],
    ['r7', 'p3', '2026-08-14', 'K65+500', '行车道', null, '管道敷设', 350, '米', 'b12', '["w13","w14"]', '晴', null, '["depth","compaction"]', '[]', null, '黄志明'],
  ];

  for (const r of reports) {
    insertReport.run(...r);
  }

  // Seed documents
  const insertDoc = db.prepare(`
    INSERT INTO documents (id, name, type, category, version, upload_date, is_latest, project_id, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const docs = [
    ['d1', '监控系统施工图纸V2.0', 'drawing', '监控系统', 'V2.0', '2024-06-15', 1, 'p1'],
    ['d2', '监控系统施工图纸V1.0', 'drawing', '监控系统', 'V1.0', '2024-03-20', 0, 'p1'],
    ['d3', '通信系统施工图纸', 'drawing', '通信系统', 'V1.0', '2024-05-10', 1, 'p1'],
    ['d4', '机电工程工程量清单', 'bill', '综合', 'V1.0', '2024-03-10', 1, 'p1'],
    ['d5', 'K12+000涵洞管道变更', 'change', '管道工程', 'V1.0', '2024-07-22', 1, 'p1'],
    ['d6', '监控立柱安装作业指导书', 'other', '监控系统', 'V1.0', '2024-04-01', 1, 'p1'],
    ['d7', '光缆敷设作业指导书', 'other', '通信系统', 'V1.0', '2024-04-01', 1, 'p1'],
    ['d8', '星哈段监控系统施工图', 'drawing', '监控系统', 'V1.0', '2024-06-20', 1, 'p2'],
    ['d9', '星哈段通信系统施工图', 'drawing', '通信系统', 'V1.0', '2024-06-20', 1, 'p2'],
    ['d10', '星哈段机电工程量清单', 'bill', '综合', 'V1.0', '2024-05-01', 1, 'p2'],
    ['d11', '隧道LED灯具安装指导书', 'other', '照明系统', 'V1.0', '2024-07-01', 1, 'p2'],
    ['d12', '西宁段监控系统施工图', 'drawing', '监控系统', 'V1.0', '2024-09-10', 1, 'p3'],
    ['d13', '西宁段机电工程量清单', 'bill', '综合', 'V1.0', '2024-08-15', 1, 'p3'],
  ];

  for (const d of docs) {
    insertDoc.run(d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], `[文档] ${d[1]} 分类：${d[3]}`);
  }

}
