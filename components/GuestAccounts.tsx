'use client';

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pencil, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Guest {
  id: string;
  username: string;
  portfolioIds: string[];
}

interface Portfolio {
  id: string;
  name: string;
}

// editing：null = 收起、'new' = 新增、其餘為正在編輯的訪客
type Editing = null | 'new' | Guest;

interface GuestFormProps {
  editing: Guest | 'new';
  portfolios: Portfolio[];
  onDone: () => void;
  onCancel: () => void;
}

function GuestForm({ editing, portfolios, onDone, onCancel }: GuestFormProps): ReactElement {
  const isNew = editing === 'new';
  const [username, setUsername] = useState(isNew ? '' : editing.username);
  const [password, setPassword] = useState('');
  const [selected, setSelected] = useState<string[]>(isNew ? [] : editing.portfolioIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string): void =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(isNew ? '/api/settings/guests' : `/api/settings/guests/${editing.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: password || undefined, portfolioIds: selected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '儲存失敗');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">{isNew ? '新增訪客帳號' : `編輯 ${editing.username}`}</h3>
      <div>
        <label htmlFor="guest-username" className="mb-1 block text-sm text-muted">帳號</label>
        <input id="guest-username" value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="3–32 字元英數字" className="w-full" autoComplete="off" required />
      </div>
      <div>
        <label htmlFor="guest-password" className="mb-1 block text-sm text-muted">
          {isNew ? '密碼' : '新密碼'}
        </label>
        <input id="guest-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={isNew ? '' : '留空不變更'} className="w-full"
          autoComplete="new-password" required={isNew} />
      </div>
      <fieldset>
        <legend className="mb-1 text-sm text-muted">可檢視的投資組合</legend>
        {portfolios.length === 0 && <p className="text-xs text-muted">尚無投資組合</p>}
        {portfolios.map((p) => (
          <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)}
              className="h-5 w-5 shrink-0 rounded accent-primary" />
            <span className="truncate">{p.name}</span>
          </label>
        ))}
      </fieldset>
      {error && <p role="alert" className="text-sm text-down">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving} className="btn-primary min-h-11 flex items-center gap-2">
          {saving && <RefreshCw className="h-4 w-4 animate-spin" />}{isNew ? '建立帳號' : '儲存變更'}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-border/50">
          取消
        </button>
      </div>
    </form>
  );
}

export default function GuestAccounts(): ReactElement {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Guest | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [authRes, portRes] = await Promise.all([fetch('/api/settings/auth'), fetch('/api/portfolios')]);
      const [authJson, portJson] = await Promise.all([authRes.json(), portRes.json()]);
      if (!authRes.ok || !portRes.ok) throw new Error(authJson.error || portJson.error || '載入失敗');
      setGuests(authJson.data.guests);
      // 沒有組合時 API 會回假的 'default'，不能拿來授權
      setPortfolios((portJson.data as Portfolio[]).filter((p) => p.id !== 'default'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(guest: Guest): Promise<void> {
    setDeleting(null);
    try {
      const res = await fetch(`/api/settings/guests/${guest.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '刪除失敗');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    }
  }

  const nameOf = (id: string): string | undefined => portfolios.find((p) => p.id === id)?.name;

  return (
    <section className="card space-y-5" aria-labelledby="guests-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="guests-heading" className="flex items-center gap-2 font-semibold">
          <Users className="h-5 w-5 text-primary" />訪客帳號
        </h2>
        {editing === null && (
          <button onClick={() => setEditing('new')} className="min-h-11 flex items-center gap-2 rounded-lg px-3 text-sm hover:bg-border/50">
            <Plus className="h-4 w-4" />新增訪客
          </button>
        )}
      </div>
      <p className="text-sm text-muted">訪客為唯讀，只看得到勾選的投資組合；新建立的組合預設不開放給任何訪客。</p>

      {loading && <RefreshCw className="h-5 w-5 animate-spin text-primary" />}
      {!loading && guests.length === 0 && <p className="text-sm text-muted">尚未建立訪客帳號</p>}
      <ul className="divide-y divide-border">
        {guests.map((g) => {
          const names = g.portfolioIds.map(nameOf).filter(Boolean);
          return (
            <li key={g.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.username}</p>
                <p className="truncate text-xs text-muted">{names.length ? names.join('、') : '未開放任何組合'}</p>
              </div>
              <button onClick={() => setEditing(g)} aria-label={`編輯 ${g.username}`} title="編輯"
                className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-border/50">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => setDeleting(g)} aria-label={`刪除 ${g.username}`} title="刪除"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-down hover:bg-border/50">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>

      {editing !== null && (
        <GuestForm key={editing === 'new' ? 'new' : editing.id} editing={editing} portfolios={portfolios}
          onCancel={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />
      )}
      {error && <p role="alert" className="text-sm text-down">{error}</p>}
      <ConfirmDialog isOpen={deleting !== null} title="刪除訪客帳號"
        message={`刪除後「${deleting?.username ?? ''}」將立即無法登入。`} confirmText="刪除" cancelText="取消"
        variant="danger" onConfirm={() => { if (deleting) void remove(deleting); }} onCancel={() => setDeleting(null)} />
    </section>
  );
}
