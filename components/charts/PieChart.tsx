"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector, type PieSectorDataItem } from "recharts";
import type { HoldingWithQuote } from "@/types";

interface Props {
  holdings: HoldingWithQuote[];
  cashBalance?: number;
}

interface PieTooltipPayloadItem {
  payload: {
    name: string;
    value: number;
  };
}

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
];

const CASH_COLOR = "#6b7280";

// 滑鼠指到的扇形往外放大並加陰影，像浮起來
function ActiveSector(props: PieSectorDataItem) {
  return (
    <Sector
      {...props}
      outerRadius={(props.outerRadius ?? 0) + 7}
      style={{ filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.6))" }}
    />
  );
}

function CustomTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: PieTooltipPayloadItem[];
  total: number;
}) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    const percent = ((item.value / total) * 100).toFixed(1);
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold">{item.name}</p>
        <p className="text-muted text-sm">
          NT$ {item.value.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}
        </p>
        <p className="text-muted text-sm">{percent}%</p>
      </div>
    );
  }

  return null;
}

export default function PortfolioPieChart({
  holdings,
  cashBalance = 0,
}: Props) {
  const holdingsData = holdings
    .filter((h) => (h.currentValue || 0) > 0)
    .map((h, index) => ({
      name: h.symbol,
      value: h.currentValue || 0,
      color: COLORS[index % COLORS.length],
    }));

  const data = [
    ...holdingsData,
    ...(cashBalance > 0
      ? [{ name: "現金", value: cashBalance, color: CASH_COLOR }]
      : []),
  ];

  const total = data.reduce((sum, d) => sum + d.value, 0);

  // 依權重由高到低排序（圖表和 Legend 共用同一份排序後資料）
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted">
        尚無資產資料
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      {/* 圓餅圖：固定尺寸，上緣與右側圖例對齊 */}
      <div className="h-[140px] w-[140px] shrink-0 sm:h-[170px] sm:w-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={sortedData}
              cx="50%"
              cy="50%"
              innerRadius="53%"
              outerRadius="90%"
              activeShape={ActiveSector}
              paddingAngle={2}
              dataKey="value"
            >
              {sortedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 圖例：單欄，項目多時在自身範圍內捲動 */}
      <div className="min-w-0 flex-1 space-y-1 overflow-y-auto max-h-[240px]">
        {sortedData.map((entry, index) => {
          const percent = ((entry.value / total) * 100).toFixed(1);
          return (
            <div
              key={index}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted truncate">{entry.name}</span>
              </div>
              <span className="text-muted flex-shrink-0 ml-1">{percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
