'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

type Mode = 'login' | 'register' | 'setup';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    async function checkStatus() {
      try {
        const response = await fetch('/api/auth/status', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json() as { adminSetupRequired?: boolean };
        if (result.adminSetupRequired) setMode('setup');
      } catch {
        // 状态检查失败不阻塞正常登录；提交时仍由服务端验证账号。
      } finally { window.clearTimeout(timeout); }
    }
    void checkStatus();
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, []);

  const resetMessages = () => { setError(''); setNotice(''); };
  const changeMode = (next: Mode) => { resetMessages(); setPassword(''); setConfirmPassword(''); setMode(next); setUsername(''); };

  const submit = async () => {
    setBusy(true); resetMessages();
    try {
      const endpoint = mode === 'setup' ? '/api/auth/setup' : mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload = mode === 'setup' ? { password, confirmPassword } : mode === 'register' ? { displayName, password, confirmPassword } : { username, password, remember: rememberPassword };
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || '操作失败');
      if (mode === 'login') {
        const nextPath = new URLSearchParams(window.location.search).get('next');
        window.location.replace(nextPath?.startsWith('/') ? nextPath : '/'); return;
      }
      if (mode === 'setup') {
        setUsername('admin'); setNotice('管理员密码设置成功，请登录'); setMode('login');
      } else {
        setUsername(displayName); setNotice(result.message || '注册成功，请等待管理员审核'); setMode('login');
      }
      setPassword(''); setConfirmPassword('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
    finally { setBusy(false); }
  };

  const title = mode === 'setup' ? '首次设置管理员密码' : mode === 'register' ? '注册新账号' : '账号登录';
  return <div className="flex min-h-screen items-center justify-center bg-[#F3F5F8] p-5"><div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lg">
    <div className="flex items-center justify-center gap-2.5"><Image src="/chongqing-ruisi-logo.png" alt="重庆瑞思 Logo" width={48} height={48} priority className="h-12 w-12 shrink-0 object-contain" /><div><div className="text-lg font-bold leading-tight">重庆瑞思施工管理系统</div><div className="mt-0.5 text-sm text-gray-400">{title}</div></div></div>
    {mode === 'setup' && <div className="mt-5 rounded-xl bg-blue-50 p-3 text-sm leading-5 text-[#1E5AA8]">管理员账号为 <b>admin</b>。请设置首次登录密码，密码设置后不可再次通过此页面初始化。</div>}
    <div className="mt-5 space-y-3">
      {mode === 'login' && <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="姓名" className="w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[#1E5AA8]" />}
      {mode === 'register' && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="姓名" className="w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[#1E5AA8]" />}
      <input autoComplete={mode === 'login' && rememberPassword ? 'current-password' : 'off'} type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => mode === 'login' && event.key === 'Enter' && void submit()} placeholder={mode === 'setup' ? '设置管理员密码' : '密码'} className="w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[#1E5AA8]" />
      {mode !== 'login' && <input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void submit()} placeholder="再次输入密码" className="w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[#1E5AA8]" />}
    </div>
    {mode === 'login' && <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={rememberPassword} onChange={(event) => setRememberPassword(event.target.checked)} className="h-4 w-4 accent-[#1E5AA8]" /><span>记住密码</span></label>}
    {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">{notice}</p>}
    <button type="button" onClick={() => void submit()} disabled={busy || !password || (mode === 'register' && !displayName)} className="mt-4 w-full rounded-xl bg-[#1E5AA8] py-3 font-medium text-white disabled:opacity-50">{busy ? '处理中...' : mode === 'setup' ? '设置密码' : mode === 'register' ? '提交注册' : '登录'}</button>
    {mode !== 'setup' && <div className="mt-4 flex justify-center text-sm"><button type="button" onClick={() => changeMode(mode === 'login' ? 'register' : 'login')} className="text-[#1E5AA8]">{mode === 'login' ? '没有账号？立即注册' : '已有账号？返回登录'}</button></div>}
  </div></div>;
}
