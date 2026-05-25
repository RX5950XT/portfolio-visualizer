'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, RefreshCw, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  portfolioId?: string | null;
  lookthrough?: unknown;
  isAdmin: boolean;
}

const MD_STYLES =
  'text-sm leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 ' +
  '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-3 ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 ' +
  '[&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-foreground [&_code]:bg-card [&_code]:px-1 [&_code]:rounded ' +
  '[&_table]:w-full [&_th]:text-left [&_th]:text-muted [&_th]:py-1 [&_td]:py-1';

export default function AiAdvisorCard({ portfolioId, lookthrough, isAdmin }: Props) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult('');
    try {
      const res = await fetch('/api/ai/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioId, lookthrough }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || '產生失敗');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setResult(acc);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '產生失敗');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">AI 健診</h2>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/settings')}
              className="p-2 rounded-lg hover:bg-background transition-colors text-muted"
              title="AI 設定"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {generating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {generating ? '分析中…' : '產生健診'}
            </button>
          </div>
        )}
      </div>

      {!isAdmin ? (
        <p className="text-sm text-muted">AI 健診僅供管理員使用。</p>
      ) : error ? (
        <p className="text-sm text-down">{error}</p>
      ) : result ? (
        <div className={MD_STYLES}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
        </div>
      ) : generating ? (
        <p className="text-sm text-muted flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          🤔 思考中…（首次回應約需數秒）
        </p>
      ) : (
        <p className="text-sm text-muted">
          點「產生健診」，由 AI 分析集中度風險、ETF 重疊、費用拖累並給再平衡建議。
        </p>
      )}
    </div>
  );
}
