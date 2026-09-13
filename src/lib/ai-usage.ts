import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';

export function recordAiUsage(input: { projectId?: string; profileId?: string; model: string; taskType: 'chat' | 'memory' | 'report_review'; success: boolean; fallbackUsed?: boolean; durationMs: number; error?: string }): void {
  try { getDb().prepare('INSERT INTO ai_usage_logs (id, project_id, profile_id, model, task_type, success, fallback_used, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), input.projectId || null, input.profileId || null, input.model, input.taskType, input.success ? 1 : 0, input.fallbackUsed ? 1 : 0, Math.max(0, Math.round(input.durationMs)), input.error?.slice(0, 500) || null); } catch (error) { console.error('记录 AI 使用情况失败:', error); }
}

export function getAiUsageSummary() {
  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) total, SUM(success) success, SUM(fallback_used) fallbacks, ROUND(AVG(duration_ms)) avg_duration FROM ai_usage_logs WHERE created_at >= datetime('now', '-30 days')`).get() as { total: number; success: number | null; fallbacks: number | null; avg_duration: number | null };
  const models = db.prepare(`SELECT model, COUNT(*) calls, SUM(success) success FROM ai_usage_logs WHERE created_at >= datetime('now', '-30 days') GROUP BY model ORDER BY calls DESC`).all();
  return { total: total.total || 0, successRate: total.total ? Math.round(((total.success || 0) / total.total) * 100) : 0, fallbackCount: total.fallbacks || 0, averageDurationMs: total.avg_duration || 0, models };
}
