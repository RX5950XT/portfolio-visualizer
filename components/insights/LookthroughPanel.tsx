'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReactElement } from 'react';
import { RefreshCw } from 'lucide-react';
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
}

interface Props {
  portfolioId?: string | null;
  refreshKey?: number;
}

export default function LookthroughPanel({ portfolioId, refreshKey }: Props): ReactElement {
  const [lookthrough, setLookthrough] = useState<LookthroughData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [loadLookthrough, refreshKey]);

  return (
    <div className="min-w-0">
      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="h-32 flex items-center justify-center text-danger">{error}</div>
      ) : !lookthrough ? (
        <div className="h-32 flex items-center justify-center text-muted">
          此投資組合尚無持股
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <DistributionBars title="產業分佈" items={lookthrough.sectors} />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-muted mb-3">
                真實重倉 Top 10（穿透 ETF 持股）
              </h3>
              <RealHoldingsTable items={lookthrough.realHoldings} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

