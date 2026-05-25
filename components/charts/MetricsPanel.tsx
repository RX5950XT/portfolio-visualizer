'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface Metrics {
  xirr: number | null;
  maxDrawdown: number;
  volatility: number;
  sharpe: number | null;
  winRate: { wins: number; total: number; rate: number };
  underwater: { date: string; drawdown: number }[];
}

interface Props {
  portfolioId?: string | null;
  refreshKey?: number;
}

const pct = (v: number | null, sign = false) => {
  if (v === null || !Number.isFinite(v)) return 'N/A';
  const s = sign && v > 0 ? '+' : '';
  return `${s}${(v * 100).toFixed(1)}%`;
};

export default function MetricsPanel({ portfolioId, refreshKey }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = portfolioId
        ? `/api/charts/metrics?portfolio_id=${portfolioId}`
        : '/api/charts/metrics';
      const res = await fetch(url);
      const { data: metrics, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      setData(metrics);
      setLoaded(true);
    } catch {
      setError('無法載入績效指標');
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  // 展開後才載入，避免拖慢 dashboard；portfolio/refresh 變動時若已展開則重抓
  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData, refreshKey]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // 自訂 Tooltip：確保回撤數字在深色背景清楚顯示
  const UnderwaterTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { value?: number }[];
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-2 shadow-lg">
          <p className="text-xs text-muted mb-0.5">{formatDate(String(label))}</p>
          <p className="text-sm font-semibold text-down">回撤 {pct(Number(payload[0].value ?? 0))}</p>
        </div>
      );
    }
    return null;
  };

  const trough =
    data && data.underwater.length
      ? data.underwater.reduce((min, p) => (p.drawdown < min ? p.drawdown : min), 0)
      : 0;

  return (
    <div className="card mb-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <span className="font-semibold">績效分析</span>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted" />
        )}
      </button>

      {open && (
        <div className="mt-4">
          {loading && !loaded ? (
            <div className="h-40 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="h-40 flex items-center justify-center text-danger">{error}</div>
          ) : !data ? (
            <div className="h-40 flex items-center justify-center text-muted">
              尚無足夠資料計算績效指標
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                <Metric
                  label="年化報酬 (XIRR)"
                  value={pct(data.xirr, true)}
                  positive={data.xirr !== null && data.xirr >= 0}
                />
                <Metric label="最大回撤" value={pct(data.maxDrawdown)} positive={false} />
                <Metric label="波動率 (年化)" value={pct(data.volatility)} />
                <Metric
                  label="Sharpe"
                  value={data.sharpe === null ? 'N/A' : data.sharpe.toFixed(2)}
                  positive={data.sharpe !== null && data.sharpe >= 1}
                />
                <Metric
                  label="勝率"
                  value={
                    data.winRate.total > 0
                      ? `${(data.winRate.rate * 100).toFixed(0)}%`
                      : 'N/A'
                  }
                  sub={data.winRate.total > 0 ? `${data.winRate.wins}/${data.winRate.total}` : undefined}
                />
              </div>

              <div className="text-xs text-muted mb-2">
                回撤走勢（underwater，谷底 {pct(trough)}）
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.underwater}
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      stroke="#666"
                      fontSize={12}
                      tickLine={false}
                      interval={Math.max(0, Math.floor(data.underwater.length / 6))}
                    />
                    <YAxis
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      stroke="#666"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      domain={[Math.min(trough * 1.1, -0.01), 0]}
                    />
                    <Tooltip content={<UnderwaterTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="drawdown"
                      stroke="#ef4444"
                      fill="url(#ddFill)"
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  const color =
    positive === undefined ? 'text-foreground' : positive ? 'text-up' : 'text-down';
  return (
    <div className="bg-background border border-border rounded-lg p-3">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
