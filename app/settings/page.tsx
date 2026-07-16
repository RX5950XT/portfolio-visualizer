'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Check,
  KeyRound,
  Lock,
} from 'lucide-react';

interface AiSettings {
  hasKey: boolean;
  apiKeyMasked: string;
  model: string;
  systemPrompt: string;
}

interface AuthSettings {
  adminSource: 'db' | 'env';
  guestSource: 'db' | 'env' | 'none';
  demoEnabled: boolean;
}

interface ModelOption {
  id: string;
  name: string;
}

function sourceLabel(source: string): string {
  if (source === 'db') return '資料庫 ✓';
  if (source === 'env') return '環境變數（首次引導）';
  return '未設定';
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [authSaving, setAuthSaving] = useState(false);
  const [authSaved, setAuthSaved] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [authSettings, setAuthSettings] = useState<AuthSettings | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);

  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newGuestPassword, setNewGuestPassword] = useState('');
  const [demoEnabled, setDemoEnabled] = useState(true);

  const init = useCallback(async () => {
    try {
      const meRes = await fetch('/api/auth/me');
      const me = await meRes.json();
      if (me.data?.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }

      const [settingsRes, modelsRes, authRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/ai/models'),
        fetch('/api/settings/auth'),
      ]);
      const settingsJson = await settingsRes.json();
      const modelsJson = await modelsRes.json();
      const authJson = await authRes.json();

      if (settingsJson.data) {
        const s = settingsJson.data as AiSettings;
        setSettings(s);
        setModel(s.model);
        setSystemPrompt(s.systemPrompt);
      }
      if (Array.isArray(modelsJson.data)) {
        setModels(modelsJson.data);
      }
      if (authJson.data) {
        const a = authJson.data as AuthSettings;
        setAuthSettings(a);
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

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          model,
          systemPrompt,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || '儲存失敗');
      }
      setApiKey('');
      setSaved(true);
      await init();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

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
          newAdminPassword: newAdminPassword.trim() || undefined,
          newGuestPassword: newGuestPassword.trim() || undefined,
          demoEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || '儲存失敗');
      }
      setCurrentPassword('');
      setNewAdminPassword('');
      setNewGuestPassword('');
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
          <h2 className="font-semibold">登入密碼</h2>
        </div>

        <div className="text-xs text-muted space-y-1">
          <p>管理員密碼：{sourceLabel(authSettings?.adminSource ?? 'env')}</p>
          <p>訪客密碼：{sourceLabel(authSettings?.guestSource ?? 'none')}</p>
        </div>

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
          <label className="block text-sm text-muted mb-1">新管理員密碼</label>
          <input
            type="password"
            value={newAdminPassword}
            onChange={(e) => setNewAdminPassword(e.target.value)}
            placeholder="留空不變更（至少 8 字元）"
            className="w-full"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">新訪客密碼</label>
          <input
            type="password"
            value={newGuestPassword}
            onChange={(e) => setNewGuestPassword(e.target.value)}
            placeholder="留空不變更（至少 8 字元）"
            className="w-full"
            autoComplete="new-password"
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={demoEnabled}
            onChange={(e) => setDemoEnabled(e.target.checked)}
            className="rounded"
          />
          <span>啟用 Demo 空間（公開密碼 <code>demo</code>）</span>
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
          {authSaved ? '已儲存' : authSaving ? '儲存中…' : '儲存密碼設定'}
        </button>
      </div>

      <div className="card space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <KeyRound className="w-5 h-5" />
          <h2 className="font-semibold">AI 顧問（OpenRouter）</h2>
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">
            OpenRouter API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              settings?.hasKey
                ? `已設定（${settings.apiKeyMasked}），留空不變更`
                : 'sk-or-...'
            }
            className="w-full"
            autoComplete="off"
          />
          <p className="text-xs text-muted mt-1">
            金鑰僅儲存於後端、永不顯示明文；於{' '}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              openrouter.ai/keys
            </a>{' '}
            取得。
          </p>
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">模型名稱</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            list="model-suggestions"
            placeholder="anthropic/claude-opus-4 或 openai/gpt-4o"
            className="w-full"
          />
          <datalist id="model-suggestions">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
          <p className="text-xs text-muted mt-1">
            可直接輸入任意 OpenRouter model id，下拉僅為建議。
          </p>
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">
            System Prompt（顧問口吻）
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
            className="w-full resize-y"
          />
        </div>

        {error && <p className="text-sm text-down">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? '已儲存' : saving ? '儲存中…' : '儲存設定'}
        </button>
      </div>
    </div>
  );
}
