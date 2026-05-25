'use client';

import { AlertTriangle } from 'lucide-react';

interface RealHolding {
  symbol: string;
  name: string;
  direct: number;
  viaEtf: number;
  total: number;
  pct: number;
  warn: boolean;
}

interface Props {
  items: RealHolding[];
}

const nt = (v: number) => `NT$${v.toLocaleString('zh-TW')}`;

export default function RealHoldingsTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">暫無可穿透的成分資料</p>;
  }

  return (
    <>
      {/* 桌面版表格 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted border-b border-border">
              <th className="text-left font-medium py-2">個股</th>
              <th className="text-right font-medium py-2">直接持有</th>
              <th className="text-right font-medium py-2">透過 ETF</th>
              <th className="text-right font-medium py-2">合計</th>
              <th className="text-right font-medium py-2">佔總資產</th>
            </tr>
          </thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.symbol} className="border-b border-border/50">
                <td className="py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{h.symbol}</span>
                    {h.warn && <AlertTriangle className="w-3.5 h-3.5 text-down" />}
                  </div>
                  {h.name && <span className="text-xs text-muted">{h.name}</span>}
                </td>
                <td className="text-right py-2">{h.direct > 0 ? nt(h.direct) : '—'}</td>
                <td className="text-right py-2">{h.viaEtf > 0 ? nt(h.viaEtf) : '—'}</td>
                <td className="text-right py-2 font-medium">{nt(h.total)}</td>
                <td className={`text-right py-2 ${h.warn ? 'text-down font-semibold' : ''}`}>
                  {(h.pct * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 手機版卡片 */}
      <div className="md:hidden space-y-2">
        {items.map((h) => (
          <div key={h.symbol} className="bg-background border border-border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{h.symbol}</span>
                {h.warn && <AlertTriangle className="w-3.5 h-3.5 text-down" />}
              </div>
              <span className={`text-sm ${h.warn ? 'text-down font-semibold' : ''}`}>
                {(h.pct * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted mt-2">
              <span>直接 {h.direct > 0 ? nt(h.direct) : '—'}</span>
              <span>ETF {h.viaEtf > 0 ? nt(h.viaEtf) : '—'}</span>
              <span className="text-foreground">合計 {nt(h.total)}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted mt-3">
        <AlertTriangle className="w-3 h-3 inline text-down mr-1" />
        單一個股 &gt;10%，集中度偏高。ETF 成分以 Yahoo 前十大持股穿透，台股 ETF 涵蓋度可能較弱。
      </p>
    </>
  );
}
