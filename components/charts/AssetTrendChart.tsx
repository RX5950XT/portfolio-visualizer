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
  Brush,
} from 'recharts';
import { RefreshCw } from 'lucide-react';

interface ChartDataPoint {
  date: string;
  value: number;
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
      // 使用 timestamp 避免瀏覽器快取
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

  // 格式化金額
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
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
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm text-muted mb-1">{label}</p>
          <p className="font-semibold">
            NT$ {payload[0].value.toLocaleString('zh-TW')}
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

  // 計算 Y 軸範圍（留 10% 空間）
  const minValue = Math.min(...data.map((d) => d.value));
  const maxValue = Math.max(...data.map((d) => d.value));
  const padding = (maxValue - minValue) * 0.1 || maxValue * 0.1;
  const yMin = Math.floor((minValue - padding) / 10000) * 10000;
  const yMax = Math.ceil((maxValue + padding) / 10000) * 10000;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
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
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatCurrency}
            stroke="#666"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={[yMin, yMax]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6' }}
          />
          {/* 縮放/拖動範圍選擇器 */}
          <Brush
            dataKey="date"
            height={30}
            stroke="#3b82f6"
            fill="#1a1a1a"
            tickFormatter={formatDate}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
