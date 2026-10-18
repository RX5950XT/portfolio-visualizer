"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw } from "lucide-react";
import { dailyPnLDateRange, taipeiDate } from "@/lib/chart-period";

interface DailyPnLPoint {
  date: string;
  pnl: number;
}

interface Props {
  portfolioId?: string | null;
  refreshKey?: number;
}

interface TooltipPayloadItem {
  value: number;
}

interface RoundedBarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: {
    pnl?: number;
  };
}

const PERIOD_OPTIONS = [
  { value: 30, label: '30日' }, { value: 60, label: '60日' },
  { value: 90, label: '90日' }, { value: 180, label: '180日' },
  { value: 'ytd', label: 'YTD' }, { value: 'year', label: '近一年' },
] as const;

// 依資料點數計算合適的 XAxis 刻度間隔，讓標籤數量維持在 6~8 個左右
function xAxisInterval(count: number): number {
  return Math.max(0, Math.floor(count / 6) - 1);
}

function toDateStr(d: Date): string {
  return taipeiDate(d);
}

export default function DailyPnLChart({ portfolioId, refreshKey }: Props) {
  const [data, setData] = useState<DailyPnLPoint[]>([]);
  const [period, setPeriod] = useState<number | 'ytd' | 'year' | 'custom'>(30);
  const today = toDateStr(new Date());
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateStr(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isCustom = period === "custom";

  const fetchData = useCallback(async (signal: AbortSignal) => {
    // 自訂區間不合法時不送請求，沿用現有資料
    if (isCustom && (!customStart || !customEnd || customStart > customEnd)) {
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const timestamp = Date.now();
      let url = `/api/charts/daily-pnl?_t=${timestamp}`;
      if (isCustom) {
        url += `&start=${customStart}&end=${customEnd}`;
      } else if (typeof period === 'number') {
        url += `&days=${period}`;
      } else if (period === 'ytd' || period === 'year') {
        url += `&${new URLSearchParams(dailyPnLDateRange(period))}`;
      }
      if (portfolioId) {
        url += `&portfolio_id=${portfolioId}`;
      }
      const res = await fetch(url, { signal });
      const { data: pnlData, error: apiError } = await res.json();

      if (apiError) {
        throw new Error(apiError);
      }

      if (!signal.aborted) setData(pnlData || []);
    } catch (err) {
      if (signal.aborted) return;
      console.error("載入損益資料失敗:", err);
      setError("無法載入損益資料");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [portfolioId, period, isCustom, customStart, customEnd]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData, refreshKey]);

  // 格式化金額
  const formatCurrency = (value: number) => {
    const prefix = value >= 0 ? "+" : "";
    if (Math.abs(value) >= 1000) {
      return `${prefix}${(value / 1000).toFixed(0)}K`;
    }
    return `${prefix}${value}`;
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    const spansYears = data.some((point) => point.date.slice(0, 4) !== year);
    return spansYears ? `${year.slice(2)}/${Number(month)}/${Number(day)}` : `${Number(month)}/${Number(day)}`;
  };

  // 自訂 Tooltip
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      const isPositive = value >= 0;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm text-muted mb-1">{label}</p>
          <p
            className={`font-semibold ${isPositive ? "text-up" : "text-down"}`}
          >
            {isPositive ? "+" : ""}NT$ {value.toLocaleString("zh-TW")}
          </p>
        </div>
      );
    }
    return null;
  };

  // 天數切換按鈕列（不論載入狀態都顯示，避免版面跳動）
  const daySelector = (
    <div className="mb-3">
      <div className="flex items-center gap-1 flex-wrap">
        {PERIOD_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPeriod(value)}
            aria-pressed={period === value}
            className={`min-h-9 px-2.5 py-1 text-xs rounded-full font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              period === value
                ? "bg-primary text-white"
                : "bg-border/50 text-muted hover:text-foreground hover:bg-border"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setPeriod("custom")}
          aria-pressed={isCustom}
          className={`min-h-9 px-2.5 py-1 text-xs rounded-full font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
            isCustom
              ? "bg-primary text-white"
              : "bg-border/50 text-muted hover:text-foreground hover:bg-border"
          }`}
        >
          自訂
        </button>
      </div>
      {isCustom && (
        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted">
          <input
            type="date"
            value={customStart}
            max={customEnd || today}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-2 py-1 text-xs"
            title="開始日期"
          />
          <span>~</span>
          <input
            type="date"
            value={customEnd}
            min={customStart}
            max={today}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-2 py-1 text-xs"
            title="結束日期"
          />
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        {daySelector}
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        {daySelector}
        <div className="flex-1 flex items-center justify-center text-danger">
          {error}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {daySelector}
        <div className="flex-1 flex items-center justify-center text-muted">
          尚無足夠資料顯示損益圖
        </div>
      </div>
    );
  }

  // 計算 Y 軸範圍
  const allValues = data.map((d) => d.pnl);
  const maxAbs = Math.max(...allValues.map(Math.abs));
  const yRange = Math.ceil(maxAbs / 1000) * 1000 || 1000;

  return (
    <div className="h-full flex flex-col">
      {daySelector}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#333"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="#bdbdbd"
              fontSize={12}
              tickLine={false}
              interval={xAxisInterval(data.length)}
            />
            <YAxis
              tickFormatter={formatCurrency}
              stroke="#bdbdbd"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              domain={[-yRange, yRange]}
              tickCount={5}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="pnl"
              shape={(props: RoundedBarShapeProps) => {
                const { x = 0, y = 0, width = 0, height = 0, payload } = props;
                const fill = (payload?.pnl ?? 0) >= 0 ? "#22c55e" : "#ef4444";

                if (Math.abs(height) < 1) return null;

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
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
