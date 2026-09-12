import type Database from 'better-sqlite3';

export interface IpSecurityRow {
  ip_address: string;
  failed_attempts: number;
  last_failed_at: string | null;
  blocked: number;
  blocked_reason: string | null;
  blocked_at: string | null;
  blocked_by: string | null;
  created_at: string;
  updated_at: string;
}

export function getRequestIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

export function findIpSecurity(db: Database.Database, ip: string): IpSecurityRow | undefined {
  return db.prepare('SELECT * FROM auth_ip_security WHERE ip_address = ?').get(ip) as IpSecurityRow | undefined;
}

/** 30 分钟内连续失败累计；达到 5 次后持续封禁，直到管理员解除。 */
export function recordPasswordFailure(db: Database.Database, ip: string): IpSecurityRow | undefined {
  if (ip === 'unknown') return undefined;
  db.prepare(`INSERT INTO auth_ip_security
    (ip_address, failed_attempts, last_failed_at, blocked, blocked_reason, blocked_at, blocked_by, updated_at)
    VALUES (?, 1, datetime('now'), 0, NULL, NULL, NULL, datetime('now'))
    ON CONFLICT(ip_address) DO UPDATE SET
      failed_attempts = CASE
        WHEN auth_ip_security.blocked = 1 THEN auth_ip_security.failed_attempts
        WHEN auth_ip_security.last_failed_at < datetime('now', '-30 minutes') THEN 1
        ELSE auth_ip_security.failed_attempts + 1 END,
      last_failed_at = datetime('now'), updated_at = datetime('now')`).run(ip);
  db.prepare(`UPDATE auth_ip_security SET blocked = 1,
    blocked_reason = '30分钟内密码连续错误5次，系统自动封禁', blocked_at = datetime('now'), blocked_by = '系统自动', updated_at = datetime('now')
    WHERE ip_address = ? AND failed_attempts >= 5 AND blocked = 0`).run(ip);
  return findIpSecurity(db, ip);
}

export function clearPasswordFailures(db: Database.Database, ip: string): void {
  if (ip === 'unknown') return;
  db.prepare(`UPDATE auth_ip_security SET failed_attempts = 0, last_failed_at = NULL, updated_at = datetime('now')
    WHERE ip_address = ? AND blocked = 0`).run(ip);
}
