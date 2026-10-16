'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReactElement } from 'react';
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
import { RefreshCw } from 'lucide-react';

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

interface Props {
  portfolioId?: string | null;
  refreshKey?: number;
}

export default function DividendsPanel({ portfolioId, refreshKey }: Props): ReactElement {
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
  }, [load, refreshKey]);

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
    <div className="min-w-0">
      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="h-32 flex items-center justify-center text-danger">{error}</div>
      ) : !data ? (
        <div className="h-32 flex items-center justify-center text-muted">
          此投資組合尚無持股
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 總覽卡 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-border pb-3 lg:col-span-2">
            <Card label="預估年配息" value={nt(data.annualEstimate)} />
            <Card label="本月將入帳" value={nt(data.thisMonthIncome)} />
            <Card label="平均殖利率" value={`${(data.yieldRate * 100).toFixed(2)}%`} />
            <Card label="殖利率 @ 成本" value={`${(data.yieldOnCost * 100).toFixed(2)}%`} accent />
          </div>

          {/* 每月配息 */}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-3">每月配息（近 12 月）</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    stroke="#bdbdbd"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))}
                    stroke="#bdbdbd"
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
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-3">即將除息</h3>
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted">近期無預估除息事件（Yahoo 對台股除息日涵蓋較弱）。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
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

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }): ReactElement {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${accent ? 'text-up' : ''}`}>{value}</p>
    </div>
  );
}

