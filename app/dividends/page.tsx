'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ArrowLeft, RefreshCw, Coins } from 'lucide-react';

interface DividendData {
  annualEstimate: number;
  thisMonthIncome: number;
  yieldRate: number;
  yieldOnCost: number;
  monthly: { month: string; amount: number }[];
  upcoming: {
    symbol: string;
    exDate: string;
    perShare: number;
    shares: number;
    estAmount: number;
  }[];
}

const nt = (v: number) => `NT$${v.toLocaleString('zh-TW')}`;

function DividendsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolioId = searchParams.get('portfolio_id');
  const portfolioName = searchParams.get('name');

  const [data, setData] = useState<DividendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = portfolioId
        ? `/api/dividends?portfolio_id=${portfolioId}`
        : '/api/dividends';
      const res = await fetch(url);
      const { data: d, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      setData(d);
    } catch {
      setError('無法載入配息資料');
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBack = () => {
    const params = new URLSearchParams();
    if (portfolioId) params.set('portfolio_id', portfolioId);
    if (portfolioName) params.set('name', portfolioName);
    const qs = params.toString();
    router.push(`/dashboard${qs ? `?${qs}` : ''}`);
  };

  const formatMonth = (m: string) => `${parseInt(m.slice(5), 10)}月`;

  // 自訂 Tooltip：built-in formatter 在深色背景下數字不顯示，改用明確樣式
  const MonthTooltip = ({
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
          <p className="text-xs text-muted mb-0.5">{formatMonth(String(label))}</p>
          <p className="text-sm font-semibold text-up">{nt(Number(payload[0].value ?? 0))}</p>
        </div>
      );
    }
    return null;
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
        <Coins className="w-6 h-6 text-primary" />
        <h1 className="text-xl md:text-2xl font-bold">配息追蹤</h1>
        {portfolioName && <span className="text-muted">· {portfolioName}</span>}
      </header>

      {loading ? (
        <div className="h-60 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="h-60 flex items-center justify-center text-danger">{error}</div>
      ) : !data ? (
        <div className="h-60 flex items-center justify-center text-muted">
          此投資組合尚無持股
        </div>
      ) : (
        <div className="space-y-6">
          {/* 總覽卡 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card label="預估年配息" value={nt(data.annualEstimate)} />
            <Card label="本月將入帳" value={nt(data.thisMonthIncome)} />
            <Card label="平均殖利率" value={`${(data.yieldRate * 100).toFixed(2)}%`} />
            <Card label="殖利率 @ 成本" value={`${(data.yieldOnCost * 100).toFixed(2)}%`} accent />
          </div>

          {/* 每月配息 */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">每月配息（近 12 月）</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    stroke="#666"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))}
                    stroke="#666"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<MonthTooltip />} cursor={{ fill: '#ffffff10' }} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {data.monthly.map((m) => (
                      <Cell key={m.month} fill="#22c55e" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 即將除息 */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">即將除息</h2>
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted">近期無預估除息事件（Yahoo 對台股除息日涵蓋較弱）。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted border-b border-border">
                      <th className="text-left font-medium py-2">標的</th>
                      <th className="text-left font-medium py-2">除息日</th>
                      <th className="text-right font-medium py-2">每股配息</th>
                      <th className="text-right font-medium py-2">持股</th>
                      <th className="text-right font-medium py-2">預估金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcoming.map((u) => (
                      <tr key={`${u.symbol}-${u.exDate}`} className="border-b border-border/50">
                        <td className="py-2 font-medium">{u.symbol}</td>
                        <td className="py-2">{u.exDate}</td>
                        <td className="text-right py-2">{u.perShare}</td>
                        <td className="text-right py-2">{u.shares.toLocaleString('zh-TW')}</td>
                        <td className="text-right py-2 font-medium text-up">{nt(u.estAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card">
      <p className="text-sm text-muted mb-2">{label}</p>
      <p className={`text-xl md:text-2xl font-bold ${accent ? 'text-up' : ''}`}>{value}</p>
    </div>
  );
}

export default function DividendsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      }
    >
      <DividendsContent />
    </Suspense>
  );
}
