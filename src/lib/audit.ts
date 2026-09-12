import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { verifySessionToken } from '@/lib/auth-core';

export interface AuditInput {
  projectId?: string | null;
  module: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  result?: 'success' | 'failure';
  operatorName?: string;
  operatorId?: string | null;
}

function safeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value, (key, item: unknown) =>
    /password|token|cookie|secret|api.?key/i.test(key) ? '[已隐藏]' : item,
  ).slice(0, 50_000);
}

function describeDevice(userAgent: string): { deviceType: string; browser: string } {
  const deviceType = /Android/i.test(userAgent) ? '安卓手机' : /iPhone|iPad/i.test(userAgent) ? '苹果移动设备' : /Mobile/i.test(userAgent) ? '移动设备' : '电脑';
  const browser = /Edg\//i.test(userAgent) ? 'Edge' : /Chrome\//i.test(userAgent) ? 'Chrome' : /Firefox\//i.test(userAgent) ? 'Firefox' : /Safari\//i.test(userAgent) ? 'Safari' : '其他浏览器';
  return { deviceType, browser };
}

export async function writeAuditLog(db: Database.Database, request: Request, input: AuditInput): Promise<void> {
  try {
    const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)construction_session=([^;]+)/)?.[1];
    const user = await verifySessionToken(cookie ? decodeURIComponent(cookie) : undefined, process.env.APP_SESSION_SECRET || '');
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwarded || request.headers.get('x-real-ip') || null;
    const userAgent = request.headers.get('user-agent') || '';
    const device = describeDevice(userAgent);
    db.prepare(`INSERT INTO audit_logs
      (id, project_id, action, entity_type, entity_id, detail, operator, operator_id, module, result,
       ip_address, user_agent, before_data, after_data, device_type, browser)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), input.projectId || null, input.action, input.entityType, input.entityId || null,
        input.summary, input.operatorName || user?.name || '未知用户', input.operatorId || user?.id || null,
        input.module, input.result || 'success', ip, userAgent,
        safeJson(input.before), safeJson(input.after), device.deviceType, device.browser);
  } catch (error) {
    console.error('写入操作日志失败:', error);
  }
}
