'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { HoldingWithQuote } from '@/types';

interface Props {
  holdings: HoldingWithQuote[];
  cashBalance?: number;
}

// 預設顏色
const COLORS = [
  '#3b82f6', // 藍
  '#22c55e', // 綠
  '#eab308', // 黃
  '#ef4444', // 紅
  '#a855f7', // 紫
  '#06b6d4', // 青
  '#f97316', // 橙
  '#ec4899', // 粉
  '#14b8a6', // 藍綠
  '#8b5cf6', // 紫藍
];

const CASH_COLOR = '#6b7280'; // 現金用灰色

export default function PortfolioPieChart({ holdings, cashBalance = 0 }: Props) {
  // 準備圖表數據
  const holdingsData = holdings
    .filter(h => (h.currentValue || 0) > 0)
    .map((h, index) => ({
      name: h.symbol,
      value: h.currentValue || 0,
      color: COLORS[index % COLORS.length],
    }));

  // 如果有現金，加入現金項目
  const data = [
    ...holdingsData,
    ...(cashBalance > 0
      ? [{ name: '現金', value: cashBalance, color: CASH_COLOR }]
      : []),
  ];

  const total = data.reduce((sum, d) => sum + d.value, 0);

  // 自訂 Tooltip
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: (typeof data)[0] }>;
  }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const percent = ((item.value / total) * 100).toFixed(1);
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold">{item.name}</p>
          <p className="text-muted text-sm">
            NT$ {item.value.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-muted text-sm">{percent}%</p>
        </div>
      );
    }
    return null;
  };

  // 自訂 Legend
  const CustomLegend = ({
    payload,
  }: {
    payload?: Array<{ value: string; color: string }>;
  }) => {
    if (!payload) return null;
    return (
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-muted">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted">
        尚無資產資料
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
