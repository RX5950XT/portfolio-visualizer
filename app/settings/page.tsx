'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Check,
  Lock,
} from 'lucide-react';
import McpSettings from '@/components/McpSettings';
import GuestAccounts from '@/components/GuestAccounts';

interface AuthSettings {
  adminUsername: string;
  adminSource: 'db' | 'env';
  demoEnabled: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [authSaving, setAuthSaving] = useState(false);
  const [authSaved, setAuthSaved] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [authSettings, setAuthSettings] = useState<AuthSettings | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [demoEnabled, setDemoEnabled] = useState(true);

  const init = useCallback(async () => {
    try {
      const meRes = await fetch('/api/auth/me');
      const me = await meRes.json();
      if (me.data?.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }

      const authRes = await fetch('/api/settings/auth');
      const authJson = await authRes.json();
      if (!authRes.ok) throw new Error(authJson.error || '載入設定失敗');
      if (authJson.data) {
        const a = authJson.data as AuthSettings;
        setAuthSettings(a);
        setNewAdminUsername(a.adminUsername);
        setDemoEnabled(a.demoEnabled);
      }
    } catch {
      setError('載入設定失敗');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    init();
  }, [init]);

  const handleAuthSave = async () => {
    setAuthSaving(true);
    setAuthError(null);
    setAuthSaved(false);
    try {
      if (!currentPassword) {
        throw new Error('請輸入目前管理員密碼');
      }
      const res = await fetch('/api/settings/auth', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newAdminUsername: newAdminUsername.trim() || undefined,
          newAdminPassword: newAdminPassword.trim() || undefined,
          demoEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || '儲存失敗');
      }
      setCurrentPassword('');
      setNewAdminPassword('');
      setAuthSaved(true);
      await init();
      setTimeout(() => setAuthSaved(false), 2000);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setAuthSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 rounded-lg hover:bg-card transition-colors"
            title="返回"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold">設定</h1>
        </div>
      </header>

      <div className="card space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <Lock className="w-5 h-5" />
          <h2 className="font-semibold">管理員帳號</h2>
        </div>

        {authSettings?.adminSource === 'env' && (
          <p className="text-xs text-muted">
            目前使用環境變數首次引導，儲存一次即改存資料庫。
          </p>
        )}

        <div>
          <label className="block text-sm text-muted mb-1">
            目前管理員密碼（必填）
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="驗證身分後才能變更"
            className="w-full"
            autoComplete="current-password"
          />
        </div>

        <div>
          <label htmlFor="admin-username" className="block text-sm text-muted mb-1">
            管理員帳號
          </label>
          <input
            id="admin-username"
            value={newAdminUsername}
            onChange={(e) => setNewAdminUsername(e.target.value)}
            className="w-full"
            autoComplete="username"
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">新管理員密碼</label>
          <input
            type="password"
            value={newAdminPassword}
            onChange={(e) => setNewAdminPassword(e.target.value)}
            placeholder="留空不變更"
            className="w-full"
            autoComplete="new-password"
          />
        </div>


        <label className="flex min-h-11 items-center gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={demoEnabled}
            onChange={(e) => setDemoEnabled(e.target.checked)}
            className="h-5 w-5 shrink-0 rounded accent-primary"
          />
          <span>開放 Demo 模式（登入頁顯示一鍵進入按鈕）</span>
        </label>

        {authError && <p className="text-sm text-down">{authError}</p>}

        <button
          onClick={handleAuthSave}
          disabled={authSaving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {authSaved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {authSaved ? '已儲存' : authSaving ? '儲存中…' : '儲存帳號設定'}
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-down">{error}</p>}
      <GuestAccounts />
      <McpSettings />
    </div>
  );
}
