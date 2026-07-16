'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import Logo from '@/components/Logo';

interface LoginFormProps {
  demoEnabled: boolean;
}

export default function LoginForm({ demoEnabled }: LoginFormProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
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
      setLoading(false);
    }
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
          <p className="text-muted text-sm">請輸入密碼以存取您的投資組合</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="輸入密碼"
              className="w-full pl-4 pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
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
            disabled={loading || !password}
            className="btn-primary w-full"
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>

        {demoEnabled && (
          <p className="text-muted text-xs text-center mt-4">
            輸入{' '}
            <strong className="font-bold text-foreground tracking-wide">
              demo
            </strong>{' '}
            進入展示空間 — 專屬沙盒、隨你操作
          </p>
        )}
      </div>
    </div>
  );
}
