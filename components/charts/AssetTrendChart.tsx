'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { RefreshCw } from 'lucide-react';

interface ChartDataPoint {
  date: string;
  value: number;
  cost: number;
}

interface Props {
  portfolioId?: string | null;
  refreshKey?: number;
}

export default function AssetTrendChart({ portfolioId, refreshKey }: Props) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const timestamp = Date.now();
      let url = `/api/charts/asset-trend?_t=${timestamp}`;
      if (portfolioId) {
        url += `&portfolio_id=${portfolioId}`;
      }
      const res = await fetch(url);
      const { data: chartData, error: apiError } = await res.json();

      if (apiError) {
        throw new Error(apiError);
      }

      setData(chartData || []);
    } catch (err) {
      console.error('載入走勢資料失敗:', err);
      setError('無法載入走勢資料');
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 自訂 Tooltip：顯示市值、成本、損益
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: Array<{ value: number; dataKey: string; color: string }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      const valueEntry = payload.find(p => p.dataKey === 'value');
      const costEntry = payload.find(p => p.dataKey === 'cost');
      const marketValue = valueEntry?.value || 0;
      const costBasis = costEntry?.value || 0;
      const pnl = marketValue - costBasis;
      const pnlPercent = costBasis > 0 ? ((pnl / costBasis) * 100).toFixed(2) : '0.00';
      const isPositive = pnl >= 0;

      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm text-muted mb-2">{label}</p>
          <p className="font-semibold" style={{ color: '#3b82f6' }}>
            市值: NT$ {marketValue.toLocaleString('zh-TW')}
          </p>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            成本: NT$ {costBasis.toLocaleString('zh-TW')}
          </p>
          <p className={`text-sm font-medium mt-1 ${isPositive ? 'text-up' : 'text-down'}`}>
            損益: {isPositive ? '+' : ''}NT$ {pnl.toLocaleString('zh-TW')} ({isPositive ? '+' : ''}{pnlPercent}%)
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-64 flex items-center justify-center text-danger">
        {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted">
        尚無足夠資料顯示走勢圖
      </div>
    );
  }

  // Y 軸範圍：取兩條線的聯合 min/max
  const allValues = data.flatMap((d) => [d.value, d.cost]);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const padding = (maxValue - minValue) * 0.1 || maxValue * 0.1;
  const yMin = Math.floor((minValue - padding) / 10000) * 10000;
  const yMax = Math.ceil((maxValue + padding) / 10000) * 10000;

  return (
    <div className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#666"
            fontSize={12}
            tickLine={false}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis
            tickFormatter={formatCurrency}
            stroke="#666"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={[yMin, yMax]}
            tickCount={5}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value: string) => value === 'value' ? '市值' : '成本'}
            wrapperStyle={{ fontSize: 12, color: '#999' }}
          />
          {/* 成本線：灰色虛線 */}
          <Line
            type="monotone"
            dataKey="cost"
            stroke="#6b7280"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 3, fill: '#6b7280' }}
          />
          {/* 市值線：藍色實線 */}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
