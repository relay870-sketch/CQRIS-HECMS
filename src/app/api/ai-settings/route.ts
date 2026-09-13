import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth-core';
import { getLlmConfig } from '@/lib/llm';
import { defaultAiAbilities, defaultAiPreferences, readAiPreferences, readStoredAiSettings, removeStoredAiConfig, saveAiPreferences, saveStoredAiSettings, type AiModelProfile, type AiPreferences } from '@/lib/ai-settings';
import { writeAuditLog } from '@/lib/audit';
import { getAiUsageSummary } from '@/lib/ai-usage';

initDbWithSeed();
async function admin(request: Request) { const token = request.headers.get('cookie')?.match(/(?:^|;\s*)construction_session=([^;]+)/)?.[1]; return verifySessionToken(token ? decodeURIComponent(token) : undefined, process.env.APP_SESSION_SECRET || ''); }
const hint = (key: string) => key ? `${key.slice(0, 3)}••••${key.slice(-4)}` : '';

export async function GET(request: Request) {
  if ((await admin(request))?.role !== 'admin') return NextResponse.json({ error: '仅管理员可管理 AI 配置' }, { status: 403 });
  const settings = readStoredAiSettings();
  if (settings) return NextResponse.json({ source: 'system', activeProfileId: settings.activeProfileId, fallbackProfileId: settings.fallbackProfileId, preferences: readAiPreferences(), usage: getAiUsageSummary(), profiles: settings.profiles.map(({ apiKey, ...profile }) => ({ ...profile, apiKeyHint: hint(apiKey) })) });
  const env = getLlmConfig();
  return NextResponse.json({ source: env ? 'environment' : 'none', activeProfileId: env ? 'environment' : '', fallbackProfileId: null, preferences: readAiPreferences(), usage: getAiUsageSummary(), profiles: env ? [{ id: 'environment', name: '服务器环境变量', provider: '环境变量', baseUrl: env.baseUrl, model: env.model, apiKeyHint: hint(env.apiKey), readOnly: true }] : [] });
}

export async function POST(request: Request) {
  if ((await admin(request))?.role !== 'admin') return NextResponse.json({ error: '仅管理员可管理 AI 配置' }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const action = typeof body.action === 'string' ? body.action : 'save';
  const settings = readStoredAiSettings();
  if (action === 'preferences') {
    const raw = body.preferences && typeof body.preferences === 'object' ? body.preferences as Partial<AiPreferences> : {};
    const rawAbilities = raw.abilities && typeof raw.abilities === 'object' ? raw.abilities as Partial<typeof defaultAiAbilities> : {};
    const preferences: AiPreferences = { responseStyle: raw.responseStyle === 'concise' || raw.responseStyle === 'detailed' ? raw.responseStyle : 'standard', attendanceMetric: raw.attendanceMetric === 'headcount' || raw.attendanceMetric === 'personDays' ? raw.attendanceMetric : 'both', showSources: raw.showSources !== false, memoryEnabled: raw.memoryEnabled !== false, customInstructions: typeof raw.customInstructions === 'string' ? raw.customInstructions.trim().slice(0, 2000) : '', abilities: { dailyReport: rawAbilities.dailyReport !== false, attendanceAnalysis: rawAbilities.attendanceAnalysis !== false, progressAnalysis: rawAbilities.progressAnalysis !== false, anomalyAnalysis: rawAbilities.anomalyAnalysis !== false, knowledgeQa: rawAbilities.knowledgeQa !== false } };
    saveAiPreferences(preferences);
    await writeAuditLog(getDb(), request, { module: 'system', action: 'update', entityType: 'AI个性化设置', summary: '更新 AI 回答偏好' });
    return NextResponse.json({ success: true });
  }
  if (action === 'activate' || action === 'fallback') {
    if (!settings) return NextResponse.json({ error: '暂无可切换的模型' }, { status: 400 });
    const id = typeof body.profileId === 'string' ? body.profileId : '';
    if (id && !settings.profiles.some((profile) => profile.id === id)) return NextResponse.json({ error: '模型不存在' }, { status: 404 });
    if (action === 'activate') { settings.activeProfileId = id; if (settings.fallbackProfileId === id) settings.fallbackProfileId = null; }
    else settings.fallbackProfileId = id && id !== settings.activeProfileId ? id : null;
    saveStoredAiSettings(settings);
    return NextResponse.json({ success: true });
  }

  const profileId = typeof body.profileId === 'string' ? body.profileId : '';
  const existing = settings?.profiles.find((profile) => profile.id === profileId);
  const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : existing?.apiKey || '';
  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/, '') : '';
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const provider = typeof body.provider === 'string' ? body.provider.trim() : '自定义';
  if (!apiKey || !baseUrl || !model || !name) return NextResponse.json({ error: '请完整填写配置名称、API Key、接口地址和模型名称' }, { status: 400 });
  if (!/^https?:\/\//i.test(baseUrl)) return NextResponse.json({ error: '接口地址必须以 http:// 或 https:// 开头' }, { status: 400 });
  if (action === 'test') {
    try { const response = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: '请只回复：连接成功' }], stream: false, max_tokens: 12 }), signal: AbortSignal.timeout(15000) }); if (!response.ok) return NextResponse.json({ error: `连接失败（HTTP ${response.status}）` }, { status: 400 }); return NextResponse.json({ success: true, message: '连接成功，模型可以正常响应' }); } catch (error) { return NextResponse.json({ error: error instanceof Error && error.name === 'TimeoutError' ? '连接超时' : `连接失败：${error instanceof Error ? error.message : '未知错误'}` }, { status: 400 }); }
  }
  const profile: AiModelProfile = { id: existing?.id || randomUUID(), name, provider, apiKey, baseUrl, model };
  const profiles = settings ? settings.profiles.map((item) => item.id === profile.id ? profile : item) : [];
  if (!existing) profiles.push(profile);
  const next = { profiles, activeProfileId: settings?.activeProfileId || profile.id, fallbackProfileId: settings?.fallbackProfileId || null, preferences: settings?.preferences || defaultAiPreferences };
  saveStoredAiSettings(next);
  await writeAuditLog(getDb(), request, { module: 'system', action: existing ? 'update' : 'create', entityType: 'AI配置', summary: `${existing ? '更新' : '新增'} AI 模型：${name}`, after: { name, provider, baseUrl, model } });
  return NextResponse.json({ success: true, profileId: profile.id });
}

export async function DELETE(request: Request) {
  if ((await admin(request))?.role !== 'admin') return NextResponse.json({ error: '仅管理员可管理 AI 配置' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('profileId'); const settings = readStoredAiSettings();
  if (!id || !settings) { removeStoredAiConfig(); return NextResponse.json({ success: true }); }
  const profiles = settings.profiles.filter((profile) => profile.id !== id);
  if (!profiles.length) removeStoredAiConfig(); else saveStoredAiSettings({ profiles, activeProfileId: settings.activeProfileId === id ? profiles[0].id : settings.activeProfileId, fallbackProfileId: settings.fallbackProfileId === id ? null : settings.fallbackProfileId, preferences: settings.preferences });
  await writeAuditLog(getDb(), request, { module: 'system', action: 'delete', entityType: 'AI配置', summary: '删除 AI 模型配置' });
  return NextResponse.json({ success: true });
}
