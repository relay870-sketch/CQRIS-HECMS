import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { getDb } from '@/lib/db';

export interface AiModelProfile { id: string; name: string; provider: string; apiKey: string; baseUrl: string; model: string }
export interface AiAbilities { dailyReport: boolean; attendanceAnalysis: boolean; progressAnalysis: boolean; anomalyAnalysis: boolean; reportReview: boolean; knowledgeQa: boolean }
export interface AiPreferences { responseStyle: 'concise' | 'standard' | 'detailed'; attendanceMetric: 'both' | 'headcount' | 'personDays'; showSources: boolean; memoryEnabled: boolean; customInstructions: string; abilities: AiAbilities }
export const defaultAiAbilities: AiAbilities = { dailyReport: true, attendanceAnalysis: true, progressAnalysis: true, anomalyAnalysis: true, reportReview: true, knowledgeQa: true };
export const defaultAiPreferences: AiPreferences = { responseStyle: 'standard', attendanceMetric: 'both', showSources: true, memoryEnabled: true, customInstructions: '', abilities: defaultAiAbilities };
export interface StoredAiSettings { profiles: AiModelProfile[]; activeProfileId: string; fallbackProfileId: string | null; preferences: AiPreferences }
export type StoredAiConfig = Pick<AiModelProfile, 'apiKey' | 'baseUrl' | 'model'>;
const SETTING_KEY = 'ai.llm.config';
const PREFERENCES_KEY = 'ai.preferences';

function encryptionKey(): Buffer { const secret = process.env.APP_SESSION_SECRET; if (!secret) throw new Error('服务器尚未配置会话密钥，无法安全保存 API Key'); return createHash('sha256').update(secret).digest(); }
function encrypt(value: string): string { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.'); }
function decrypt(value: string): string { const [version, iv, tag, encrypted] = value.split('.'); if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('AI 配置格式无效'); const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8'); }

export function readStoredAiSettings(): StoredAiSettings | null {
  try {
    const row = getDb().prepare('SELECT value FROM system_settings WHERE key = ?').get(SETTING_KEY) as { value: string } | undefined;
    if (!row) return null;
    const parsed = JSON.parse(decrypt(row.value)) as Record<string, unknown>;
    if (Array.isArray(parsed.profiles)) {
      const profiles = parsed.profiles.filter((item): item is AiModelProfile => !!item && typeof item === 'object' && typeof (item as AiModelProfile).id === 'string' && typeof (item as AiModelProfile).apiKey === 'string');
      if (!profiles.length) return null;
      const activeProfileId = typeof parsed.activeProfileId === 'string' && profiles.some((p) => p.id === parsed.activeProfileId) ? parsed.activeProfileId : profiles[0].id;
      const fallbackProfileId = typeof parsed.fallbackProfileId === 'string' && profiles.some((p) => p.id === parsed.fallbackProfileId) && parsed.fallbackProfileId !== activeProfileId ? parsed.fallbackProfileId : null;
      const rawPreferences = parsed.preferences && typeof parsed.preferences === 'object' ? parsed.preferences as Partial<AiPreferences> : {};
      const preferences: AiPreferences = { ...defaultAiPreferences, ...rawPreferences, abilities: { ...defaultAiAbilities, ...(rawPreferences.abilities || {}) }, customInstructions: typeof rawPreferences.customInstructions === 'string' ? rawPreferences.customInstructions.slice(0, 2000) : '' };
      return { profiles, activeProfileId, fallbackProfileId, preferences };
    }
    if (typeof parsed.apiKey === 'string' && typeof parsed.baseUrl === 'string' && typeof parsed.model === 'string') {
      const profile: AiModelProfile = { id: 'legacy-default', name: parsed.model, provider: '自定义', apiKey: parsed.apiKey, baseUrl: parsed.baseUrl, model: parsed.model };
      return { profiles: [profile], activeProfileId: profile.id, fallbackProfileId: null, preferences: defaultAiPreferences };
    }
    return null;
  } catch (error) { console.error('读取 AI 配置失败:', error); return null; }
}

export function saveStoredAiSettings(settings: StoredAiSettings): void { const value = encrypt(JSON.stringify(settings)); getDb().prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(SETTING_KEY, value); }
export function readStoredAiConfig(): StoredAiConfig | null { const settings = readStoredAiSettings(); const profile = settings?.profiles.find((item) => item.id === settings.activeProfileId); return profile ? { apiKey: profile.apiKey, baseUrl: profile.baseUrl, model: profile.model } : null; }
export function saveStoredAiConfig(config: StoredAiConfig): void { const profile: AiModelProfile = { id: randomUUID(), name: config.model, provider: '自定义', ...config }; saveStoredAiSettings({ profiles: [profile], activeProfileId: profile.id, fallbackProfileId: null, preferences: defaultAiPreferences }); }
export function readAiPreferences(): AiPreferences {
  try { const row = getDb().prepare('SELECT value FROM system_settings WHERE key = ?').get(PREFERENCES_KEY) as { value: string } | undefined; if (row) { const value = JSON.parse(row.value) as Partial<AiPreferences>; return { ...defaultAiPreferences, ...value, abilities: { ...defaultAiAbilities, ...(value.abilities || {}) } }; } } catch { /* 使用旧设置 */ }
  return readStoredAiSettings()?.preferences || defaultAiPreferences;
}
export function saveAiPreferences(preferences: AiPreferences): void { getDb().prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(PREFERENCES_KEY, JSON.stringify(preferences)); }
export function removeStoredAiConfig(): void { getDb().prepare('DELETE FROM system_settings WHERE key = ?').run(SETTING_KEY); }
