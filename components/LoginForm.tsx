'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import Logo from '@/components/Logo';

interface LoginFormProps {
  demoEnabled: boolean;
}

export default function LoginForm({ demoEnabled }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'login' | 'demo' | null>(null);
  const router = useRouter();

  const login = async (body: object, mode: 'login' | 'demo') => {
    setError('');
    setLoading(mode);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '登入失敗');
        return;
      }

      router.push('/dashboard');
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void login({ username, password }, 'login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Logo className="w-11 h-11 text-foreground" />
          <h1 className="text-2xl font-bold">Portfolio Visualizer</h1>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold mb-2">歡迎回來</h2>
          <p className="text-muted text-sm">請輸入帳號與密碼以存取您的投資組合</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="帳號"
            aria-label="帳號"
            className="w-full px-4"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密碼"
              aria-label="密碼"
              className="w-full pl-4 pr-12"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
              className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center text-muted hover:text-foreground transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>

          {error && (
            <p className="text-danger text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading !== null || !username || !password}
            className="btn-primary w-full"
          >
            {loading === 'login' ? '登入中...' : '登入'}
          </button>
        </form>

        {demoEnabled && (
          <div className="mt-6 border-t border-border pt-6 text-center">
            <button
              type="button"
              onClick={() => void login({ demo: true }, 'demo')}
              disabled={loading !== null}
              className="min-h-11 w-full rounded-lg border border-border px-4 text-sm font-medium hover:bg-border/50 disabled:opacity-50 transition-colors"
            >
              {loading === 'demo' ? '準備展示空間…' : '直接進入 Demo'}
            </button>
            <p className="text-muted text-xs mt-2">
              免帳密的專屬沙盒，隨你操作、24 小時後重置
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
