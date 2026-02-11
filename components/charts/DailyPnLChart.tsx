'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { RefreshCw } from 'lucide-react';

interface DailyPnLPoint {
  date: string;
  pnl: number;
}

interface Props {
  portfolioId?: string | null;
  refreshKey?: number;
}

export default function DailyPnLChart({ portfolioId, refreshKey }: Props) {
  const [data, setData] = useState<DailyPnLPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 使用 timestamp 避免瀏覽器快取
      const timestamp = Date.now();
      let url = `/api/charts/daily-pnl?days=30&_t=${timestamp}`;
      if (portfolioId) {
        url += `&portfolio_id=${portfolioId}`;
      }
      const res = await fetch(url);
      const { data: pnlData, error: apiError } = await res.json();

      if (apiError) {
        throw new Error(apiError);
      }

      setData(pnlData || []);
    } catch (err) {
      console.error('載入損益資料失敗:', err);
      setError('無法載入損益資料');
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // 格式化金額
  const formatCurrency = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    if (Math.abs(value) >= 1000) {
      return `${prefix}${(value / 1000).toFixed(0)}K`;
    }
    return `${prefix}${value}`;
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 自訂 Tooltip
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value: number }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      const isPositive = value >= 0;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm text-muted mb-1">{label}</p>
          <p className={`font-semibold ${isPositive ? 'text-up' : 'text-down'}`}>
            {isPositive ? '+' : ''}NT$ {value.toLocaleString('zh-TW')}
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
        尚無足夠資料顯示損益圖
      </div>
    );
  }

  // 計算 Y 軸範圍
  const allValues = data.map((d) => d.pnl);
  const maxAbs = Math.max(...allValues.map(Math.abs));
  const yRange = Math.ceil(maxAbs / 1000) * 1000 || 1000;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#666"
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatCurrency}
            stroke="#666"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={[-yRange, yRange]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="pnl"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shape={((props: any) => {
              const { x, y, width, height, payload } = props;
              const fill = (payload?.pnl ?? 0) >= 0 ? '#22c55e' : '#ef4444';

              if (!height || Math.abs(height) < 1) return null;

              // Recharts 傳入的 height 可能為負值（正向柱子往上）
              // rect 不支援負 height，需手動校正座標
              const rectY = height < 0 ? y + height : y;
              const rectH = Math.abs(height);

              return (
                <rect
                  x={x}
                  y={rectY}
                  width={width}
                  height={rectH}
                  fill={fill}
                  rx={4}
                  ry={4}
                />
              );
            }) as any}
          ></Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
