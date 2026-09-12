'use client';

import { useEffect, useState } from 'react';
import { Ban, Check, Clock3, Plus, ShieldCheck, ShieldOff, UserRound, UserX } from 'lucide-react';

interface Account {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'reporter' | 'viewer';
  status: 'pending' | 'active' | 'disabled';
  created_at: string;
}

interface IpSecurity {
  ip_address: string;
  failed_attempts: number;
  last_failed_at: string | null;
  blocked: number;
  blocked_reason: string | null;
  blocked_at: string | null;
  blocked_by: string | null;
}

const roleNames = { admin: '管理员', reporter: '报工人员', viewer: '只读人员' } as const;
const statusNames = { pending: '待审核', active: '已启用', disabled: '已停用' } as const;

export default function AccountManagementPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [ipRecords, setIpRecords] = useState<IpSecurity[]>([]);
  const [ipAddress, setIpAddress] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [savingIp, setSavingIp] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [response, ipResponse] = await Promise.all([fetch('/api/accounts'), fetch('/api/ip-blacklist')]);
      const [data, ipData]: [unknown, unknown] = await Promise.all([response.json(), ipResponse.json()]);
      setAccounts(Array.isArray(data) ? data as Account[] : []);
      setIpRecords(Array.isArray(ipData) ? ipData as IpSecurity[] : []);
    } finally { setLoading(false); }
  };

  const addBlockedIp = async () => {
    if (!ipAddress.trim() || !blockReason.trim()) return alert('请填写 IP 地址和封禁原因');
    setSavingIp(true);
    try {
      const response = await fetch('/api/ip-blacklist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ipAddress, reason: blockReason }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '添加失败');
      setIpAddress(''); setBlockReason(''); await load();
    } catch (error) { alert(error instanceof Error ? error.message : '添加失败'); }
    finally { setSavingIp(false); }
  };

  const unblockIp = async (ip: string) => {
    if (!confirm(`确定解除 ${ip} 的黑名单限制吗？`)) return;
    setSavingIp(true);
    try {
      const response = await fetch(`/api/ip-blacklist?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '解除失败');
      await load();
    } catch (error) { alert(error instanceof Error ? error.message : '解除失败'); }
    finally { setSavingIp(false); }
  };

  useEffect(() => { void load(); }, []);

  const updateAccount = async (account: Account, status: 'active' | 'disabled', role = account.role === 'viewer' ? 'viewer' : 'reporter') => {
    setSavingId(account.id);
    try {
      const response = await fetch('/api/accounts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: account.id, status, role }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '保存失败');
      await load();
    } catch (error) { alert(error instanceof Error ? error.message : '保存失败'); }
    finally { setSavingId(''); }
  };

  return <div className="min-h-screen bg-[#F5F6F8] px-4 py-4 pb-24">
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#1E5AA8]" /><h1 className="font-semibold">账号审核与管理</h1></div>
      <p className="mt-1.5 text-xs leading-5 text-gray-400">新注册账号需审核后才能登录。报工人员可提交日报，只读人员只能查看。</p>
    </div>
    <div className="mt-3 space-y-2">
      {loading ? <div className="py-10 text-center text-sm text-gray-400">加载中...</div> : accounts.map((account) => (
        <div key={account.id} className="rounded-2xl bg-white p-3.5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${account.status === 'pending' ? 'bg-amber-50 text-amber-600' : account.status === 'disabled' ? 'bg-gray-100 text-gray-400' : 'bg-emerald-50 text-emerald-600'}`}>
              {account.status === 'pending' ? <Clock3 className="h-5 w-5" /> : account.status === 'disabled' ? <UserX className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-medium">{account.display_name}</span><span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{statusNames[account.status]}</span></div><div className="mt-0.5 text-xs text-gray-400">{account.role === 'admin' ? '账号 admin · ' : ''}{roleNames[account.role]}</div></div>
          </div>
          {account.role !== 'admin' && <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
            <select aria-label={`${account.display_name}账号角色`} value={account.role} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, role: event.target.value as 'reporter' | 'viewer' } : item))} className="h-9 flex-1 rounded-lg border border-gray-200 px-2 text-sm">
              <option value="reporter">报工人员</option><option value="viewer">只读人员</option>
            </select>
            {account.status !== 'active' && <button disabled={savingId === account.id} onClick={() => void updateAccount(account, 'active')} className="flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-sm text-white disabled:opacity-50"><Check className="h-4 w-4" />启用</button>}
            {account.status === 'active' && <><button disabled={savingId === account.id} onClick={() => void updateAccount(account, 'active')} className="h-9 rounded-lg bg-blue-50 px-3 text-sm text-[#1E5AA8] disabled:opacity-50">保存</button><button disabled={savingId === account.id} onClick={() => void updateAccount(account, 'disabled')} className="h-9 rounded-lg bg-gray-100 px-3 text-sm text-gray-600 disabled:opacity-50">停用</button></>}
          </div>}
        </div>
      ))}
    </div>
    <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2"><Ban className="h-5 w-5 text-red-500"/><h2 className="font-semibold">登录 IP 黑名单</h2></div>
      <p className="mt-1.5 text-xs leading-5 text-gray-400">同一 IP 在30分钟内连续输错密码5次会自动封禁，只有管理员解除后才能再次登录。</p>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-2">
        <label className="min-w-0"><span className="mb-1 block text-xs text-gray-500">IP 地址</span><input value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} placeholder="IPv4 或 IPv6" className="h-10 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-sm"/></label>
        <label className="min-w-0"><span className="mb-1 block text-xs text-gray-500">封禁原因</span><input value={blockReason} onChange={(event) => setBlockReason(event.target.value)} placeholder="填写加入黑名单的原因" className="h-10 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-sm"/></label>
        <div><button disabled={savingIp} onClick={() => void addBlockedIp()} className="flex h-10 w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-red-500 px-3 text-sm text-white disabled:opacity-50"><Plus className="h-4 w-4 shrink-0"/>添加到黑名单</button></div>
      </div>
    </section>
    <div className="mt-3 space-y-2">
      {ipRecords.length === 0 ? <div className="rounded-xl bg-white py-8 text-center text-sm text-gray-400">暂无封禁或登录失败 IP</div> : ipRecords.map((item) => (
        <div key={item.ip_address} className={`rounded-xl border p-3.5 ${item.blocked ? 'border-red-100 bg-red-50' : 'border-amber-100 bg-amber-50'}`}>
          <div className="flex items-start gap-3">
            <div className={`rounded-lg p-2 ${item.blocked ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>{item.blocked ? <Ban className="h-4 w-4"/> : <ShieldCheck className="h-4 w-4"/>}</div>
            <div className="min-w-0 flex-1"><div className="break-all font-mono text-sm font-semibold">{item.ip_address}</div><div className="mt-1 text-xs text-gray-500">{item.blocked ? item.blocked_reason || '已封禁' : `最近密码错误 ${item.failed_attempts} 次`}</div>{item.blocked_at && <div className="mt-1 text-[11px] text-gray-400">封禁时间：{item.blocked_at} · {item.blocked_by || '系统自动'}</div>}</div>
            {item.blocked === 1 && <button disabled={savingIp} onClick={() => void unblockIp(item.ip_address)} className="flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-2 text-xs text-red-600 disabled:opacity-50"><ShieldOff className="h-3.5 w-3.5"/>解除</button>}
          </div>
        </div>
      ))}
    </div>
  </div>;
}
