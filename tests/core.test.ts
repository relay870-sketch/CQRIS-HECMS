import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateProjectProgress } from '../src/lib/project-progress';
import { createSessionToken, verifySessionToken } from '../src/lib/auth-core';
import { buildDailyAttendance, calculateRevertedQuantity } from '../src/lib/report-rules';
import Database from 'better-sqlite3';
import { clearPasswordFailures, findIpSecurity, recordPasswordFailure } from '../src/lib/ip-security';

test('合同额进度按工程量乘单价加权', () => {
  const result = calculateProjectProgress([
    { total_qty: 10, completed_qty: 5, unit_price: 100 },
    { total_qty: 10, completed_qty: 10, unit_price: 300 },
  ], 20);
  assert.equal(result.progress, 87.5);
  assert.equal(result.pricing_complete, true);
});

test('单价不完整时保留人工进度', () => {
  const result = calculateProjectProgress([{ total_qty: 10, completed_qty: 5, unit_price: 0 }], 62);
  assert.equal(result.progress, 62);
  assert.equal(result.pricing_complete, false);
});

test('完成量不会让自动进度超过百分之百', () => {
  assert.equal(calculateProjectProgress([{ total_qty: 10, completed_qty: 15, unit_price: 100 }], 0).progress, 100);
});

test('登录令牌可验证且错误密钥无法通过', async () => {
  const user = { id: 'u1', username: 'tester', name: '测试员', role: 'reporter' as const };
  const token = await createSessionToken(user, 'a-secure-test-secret');
  assert.deepEqual(await verifySessionToken(token, 'a-secure-test-secret'), user);
  assert.equal(await verifySessionToken(token, 'wrong-secret'), null);
});

test('同一人员多条施工内容只形成一条考勤，全天优先且加班不重复累加', () => {
  const result = buildDailyAttendance([
    { attendance: 'half', overtimeHours: 2, workers: ['w1', 'w2'] },
    { attendance: 'full', overtimeHours: 2, workers: ['w1'] },
  ]);
  assert.deepEqual(result.get('w1'), { attendance: 'full', overtimeHours: 2 });
  assert.deepEqual(result.get('w2'), { attendance: 'half', overtimeHours: 2 });
});

test('删除日报回退清单时不会产生负完成量', () => {
  assert.equal(calculateRevertedQuantity(2, 5), 0);
  assert.equal(calculateRevertedQuantity(10, 3), 7);
});

test('同一 IP 密码错误五次后封禁，解除后可清零', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE auth_ip_security (
    ip_address TEXT PRIMARY KEY, failed_attempts INTEGER NOT NULL DEFAULT 0, last_failed_at TEXT,
    blocked INTEGER NOT NULL DEFAULT 0, blocked_reason TEXT, blocked_at TEXT, blocked_by TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`);
  for (let count = 1; count <= 4; count += 1) {
    assert.equal(recordPasswordFailure(db, '192.0.2.10')?.blocked, 0);
  }
  assert.equal(recordPasswordFailure(db, '192.0.2.10')?.blocked, 1);
  db.prepare('UPDATE auth_ip_security SET blocked = 0 WHERE ip_address = ?').run('192.0.2.10');
  clearPasswordFailures(db, '192.0.2.10');
  assert.equal(findIpSecurity(db, '192.0.2.10')?.failed_attempts, 0);
  db.close();
});
