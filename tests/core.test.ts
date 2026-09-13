import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateProjectProgress } from '../src/lib/project-progress';
import { createSessionToken, verifySessionToken } from '../src/lib/auth-core';
import { buildDailyAttendance, calculateRevertedQuantity } from '../src/lib/report-rules';
import Database from 'better-sqlite3';
import { clearPasswordFailures, findIpSecurity, recordPasswordFailure } from '../src/lib/ip-security';
import { removeDuplicateParticipants } from '../src/lib/audit-format';
import { inferDateRange } from '../src/lib/ai-project-context';
import { rankBomMatches } from '../src/lib/bom-matcher';
import { reporterCanWrite } from '../src/lib/role-permissions';

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

test('清单智能匹配综合名称、系统、单位与历史确认排序', () => {
  const items = [
    { id: 'b1', code: 'JK-01', name: '枪式摄像机安装', unit: '套', system: '监控系统' },
    { id: 'b2', code: 'TX-01', name: '通信机柜安装', unit: '台', system: '通信系统' },
  ];
  const result = rankBomMatches('摄像机安装', items, { system: '监控系统', unit: '套', history: { b1: 2 } });
  assert.equal(result[0]?.item.id, 'b1');
  assert.ok((result[0]?.score || 0) >= 80);
  assert.ok(result[0]?.reasons.includes('所属系统一致'));
});

test('清单智能匹配能识别立柱的现场常用叫法', () => {
  const items = [
    { id: 'pole', code: 'JK-08', name: '摄像机立柱安装', unit: '根', system: '监控系统' },
    { id: 'camera', code: 'JK-09', name: '摄像机设备安装', unit: '套', system: '监控系统' },
  ];
  for (const query of ['摄像机杆安装', '监控杆安装', '摄像机杆体安装', '摄像机杆件安装']) {
    assert.equal(rankBomMatches(query, items, { system: '监控系统' })[0]?.item.id, 'pole');
  }
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

test('日志中相同的施工条目人员和报工汇总人员只显示一次', () => {
  const text = '施工内容明细：\n  第1项：\n    名称：基础开挖\n    参与人员：\n      张三、李四\n参与人员：\n  张三、李四\n天气：晴';
  const result = removeDuplicateParticipants(text);
  assert.equal((result.match(/参与人员：/g) || []).length, 1);
  assert.match(result, /天气：晴/);
});

test('AI 项目查询能识别明确日期和最近天数', () => {
  const now = new Date('2026-09-13T02:00:00.000Z');
  assert.deepEqual(inferDateRange('查询2026年9月8日到2026年9月12日施工记录', now), { start: '2026-09-08', end: '2026-09-12', label: '2026-09-08至2026-09-12' });
  assert.deepEqual(inferDateRange('最近3天谁加班最多', now), { start: '2026-09-11', end: '2026-09-13', label: '最近3天' });
  assert.deepEqual(inferDateRange('上个月出勤多少个工', now), { start: '2026-08-01', end: '2026-08-31', label: '上月' });
});

test('报工账号可完成新建报工的整条请求链', () => {
  assert.equal(reporterCanWrite('POST', '/api/reports/validate'), true);
  assert.equal(reporterCanWrite('POST', '/api/photos/upload'), true);
  assert.equal(reporterCanWrite('POST', '/api/bom/match'), true);
  assert.equal(reporterCanWrite('POST', '/api/reports'), true);
  assert.equal(reporterCanWrite('POST', '/api/reports/validate/'), true);
  assert.equal(reporterCanWrite('PUT', '/api/reports'), true);
  assert.equal(reporterCanWrite('DELETE', '/api/reports'), false);
  assert.equal(reporterCanWrite('POST', '/api/accounts'), false);
});
