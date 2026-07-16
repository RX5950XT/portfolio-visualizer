'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, Layers } from 'lucide-react';
import AiAdvisorCard from '@/components/insights/AiAdvisorCard';
import DistributionBars from '@/components/insights/DistributionBars';
import RealHoldingsTable from '@/components/insights/RealHoldingsTable';

interface LookthroughData {
  totalAssets: number;
  realHoldings: {
    symbol: string;
    name: string;
    direct: number;
    viaEtf: number;
    total: number;
    pct: number;
    warn: boolean;
  }[];
  sectors: { name: string; value: number; pct: number }[];
  regions: { name: string; value: number; pct: number }[];
}

function InsightsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolioId = searchParams.get('portfolio_id');
  const portfolioName = searchParams.get('name');

  const [lookthrough, setLookthrough] = useState<LookthroughData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'guest' | 'demo' | null>(null);
  // AI 健診限 admin：demo 不得使用（避免陌生訪客耗用 OpenRouter 額度）
  const isAdmin = userRole === 'admin';

  const loadLookthrough = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = portfolioId
        ? `/api/insights/lookthrough?portfolio_id=${portfolioId}`
        : '/api/insights/lookthrough';
      const res = await fetch(url);
      const { data, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      setLookthrough(data);
    } catch {
      setError('無法載入配置透視');
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    loadLookthrough();
  }, [loadLookthrough]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((json) => setUserRole(json.data?.role || null))
      .catch(() => setUserRole(null));
  }, []);

  const handleBack = () => {
    const params = new URLSearchParams();
    if (portfolioId) params.set('portfolio_id', portfolioId);
    if (portfolioName) params.set('name', portfolioName);
    const qs = params.toString();
    router.push(`/dashboard${qs ? `?${qs}` : ''}`);
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      <header className="flex items-center gap-2 mb-6">
        <button
          onClick={handleBack}
          className="p-2 rounded-lg hover:bg-card transition-colors"
          title="返回"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl md:text-2xl font-bold">配置透視與 AI 健診</h1>
        {portfolioName && <span className="text-muted">· {portfolioName}</span>}
      </header>

      <div className="space-y-6">
        {/* AI 健診（會把 look-through 一併餵給模型） */}
        <AiAdvisorCard portfolioId={portfolioId} lookthrough={lookthrough} isAdmin={isAdmin} />

        {/* 配置透視 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">配置透視（Look-through）</h2>
          </div>

          {loading ? (
            <div className="h-40 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="h-40 flex items-center justify-center text-danger">{error}</div>
          ) : !lookthrough ? (
            <div className="h-40 flex items-center justify-center text-muted">
              此投資組合尚無持股
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <DistributionBars title="產業分佈" items={lookthrough.sectors} />
                <DistributionBars title="地區分佈" items={lookthrough.regions} />
              </div>
              <h3 className="text-sm font-semibold text-muted mb-3">
                真實重倉 Top 10（穿透 ETF 持股）
              </h3>
              <RealHoldingsTable items={lookthrough.realHoldings} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      }
    >
      <InsightsContent />
    </Suspense>
  );
}
