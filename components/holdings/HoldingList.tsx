'use client';

import { Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import type { HoldingWithQuote } from '@/types';

interface Props {
  holdings: HoldingWithQuote[];
  exchangeRate: number;
  totalValue: number; // 總資產價值（用於計算權重）
  onEdit: (holding: HoldingWithQuote) => void;
  onDelete: (holding: HoldingWithQuote) => void;
}

export default function HoldingList({ holdings, exchangeRate, totalValue, onEdit, onDelete }: Props) {
  if (holdings.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <p>尚無持股資料</p>
        <p className="text-sm mt-1">點擊「新增持股」開始追蹤你的投資組合</p>
      </div>
    );
  }

  // 格式化金額
  const formatCurrency = (value: number, currency = 'TWD'): string => {
    if (value === null || value === undefined || isNaN(value)) return '—';
    const prefix = currency === 'USD' ? '$' : 'NT$';
    const formatted = Math.abs(value).toLocaleString('zh-TW', {
      minimumFractionDigits: 0,
      maximumFractionDigits: currency === 'TWD' ? 0 : 2,
    });
    return `${value < 0 ? '-' : ''}${prefix}${formatted}`;
  };

  // 格式化日期
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  // 計算每個持股的權重，並依權重由高到低排序
  const holdingsWithWeight = holdings
    .map((holding) => ({
      ...holding,
      weight: totalValue > 0 ? ((holding.currentValue || 0) / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.weight - a.weight);

  return (
    <div className="overflow-x-auto">
      {/* 桌面版表格 */}
      <table className="w-full hidden md:table">
        <thead>
          <tr className="text-left text-muted text-sm border-b border-border">
            <th className="pb-3 font-medium">代號</th>
            <th className="pb-3 font-medium text-right">股數</th>
            <th className="pb-3 font-medium text-right">每股成本</th>
            <th className="pb-3 font-medium text-right">買入總成本</th>
            <th className="pb-3 font-medium text-right">買入日期</th>
            <th className="pb-3 font-medium text-right">現價</th>
            <th className="pb-3 font-medium text-right">當前市值</th>
            <th className="pb-3 font-medium text-right">權重</th>
            <th className="pb-3 font-medium text-right">損益</th>
            <th className="pb-3 font-medium text-right">費用率</th>
            <th className="pb-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {holdingsWithWeight.map((holding) => {
            const isPositive = (holding.gain || 0) >= 0;
            const currency = holding.market === 'US' ? 'USD' : 'TWD';
            const totalCost = Number(holding.shares) * Number(holding.cost_price);
            const gain = holding.gain || 0;
            const gainPercent = holding.gainPercent || 0;
            const hasPrice = holding.currentPrice && holding.currentPrice > 0;
            
            // 損益顯示
            const gainPrefix = gain >= 0 ? '+' : '';
            const gainPercentStr = `${gainPrefix}${gainPercent.toFixed(2)}%`;
            const gainAbsStr = `${gain >= 0 ? '+' : ''}${formatCurrency(gain, 'TWD')}`;
            
            return (
              <tr 
                key={holding.id} 
                className="border-b border-border last:border-0 hover:bg-card/50 transition-colors"
              >
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{holding.symbol}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-border text-muted">
                      {holding.market}
                    </span>
                  </div>
                </td>
                <td className="py-3 text-right">{Number(holding.shares).toLocaleString()}</td>
                <td className="py-3 text-right">
                  {formatCurrency(Number(holding.cost_price), currency)}
                </td>
                <td className="py-3 text-right">
                  {formatCurrency(totalCost, currency)}
                </td>
                <td className="py-3 text-right text-muted">
                  {formatDate(holding.purchase_date)}
                </td>
                <td className="py-3 text-right">
                  {hasPrice
                    ? formatCurrency(holding.currentPrice!, currency)
                    : <span className="text-muted">載入中...</span>
                  }
                </td>
                <td className="py-3 text-right">
                  {hasPrice
                    ? formatCurrency(holding.currentValue || 0, 'TWD')
                    : '—'
                  }
                </td>
                <td className="py-3 text-right font-medium">
                  {holding.weight > 0 ? `${holding.weight.toFixed(1)}%` : '—'}
                </td>
                <td className={`py-3 text-right ${isPositive ? 'text-up' : 'text-down'}`}>
                  {hasPrice ? (
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1">
                        {isPositive ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        <span className="font-medium">{gainPercentStr}</span>
                      </div>
                      <span className="text-xs opacity-80">
                        {gainAbsStr}
                      </span>
                    </div>
                  ) : '—'}
                </td>
                <td className="py-3 text-right text-muted">
                  {holding.expenseRatio !== null && holding.expenseRatio !== undefined
                    ? `${(holding.expenseRatio * 100).toFixed(3)}%`
                    : '—'
                  }
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(holding)}
                      className="p-1.5 rounded hover:bg-border transition-colors"
                      title="編輯"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(holding)}
                      className="p-1.5 rounded hover:bg-border transition-colors text-danger"
                      title="刪除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 手機版卡片 */}
      <div className="md:hidden space-y-3">
        {holdingsWithWeight.map((holding) => {
          const isPositive = (holding.gain || 0) >= 0;
          const currency = holding.market === 'US' ? 'USD' : 'TWD';
          const totalCost = Number(holding.shares) * Number(holding.cost_price);
          const gain = holding.gain || 0;
          const gainPercent = holding.gainPercent || 0;
          const hasPrice = holding.currentPrice && holding.currentPrice > 0;
          
          // 損益顯示
          const gainPrefix = gain >= 0 ? '+' : '';
          const gainPercentStr = `${gainPrefix}${gainPercent.toFixed(2)}%`;
          const gainAbsStr = `${gain >= 0 ? '+' : ''}${formatCurrency(gain, 'TWD')}`;
          
          return (
            <div key={holding.id} className="p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{holding.symbol}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-border text-muted">
                      {holding.market}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                      {holding.weight > 0 ? `${holding.weight.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <p className="text-sm text-muted mt-0.5">
                    {Number(holding.shares).toLocaleString()} 股 @ {formatCurrency(Number(holding.cost_price), currency)}
                  </p>
                  <p className="text-xs text-muted">
                    總成本: {formatCurrency(totalCost, currency)} | 買入: {formatDate(holding.purchase_date)}
                  </p>
                </div>
                <div className={`text-right ${isPositive ? 'text-up' : 'text-down'}`}>
                  {hasPrice ? (
                    <>
                      <div className="flex items-center justify-end gap-1">
                        {isPositive ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        <span className="font-medium">{gainPercentStr}</span>
                      </div>
                      <p className="text-sm">{gainAbsStr}</p>
                      <p className="text-xs text-muted">
                        當前市值: {formatCurrency(holding.currentValue || 0, 'TWD')}
                      </p>
                    </>
                  ) : (
                    <span className="text-muted">載入中...</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="flex items-center gap-2 text-xs text-muted">
                  {hasPrice && (
                    <span>現價: {formatCurrency(holding.currentPrice!, currency)}</span>
                  )}
                  {holding.expenseRatio !== null && holding.expenseRatio !== undefined && (
                    <span>費用率: {(holding.expenseRatio * 100).toFixed(3)}%</span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => onEdit(holding)}
                    className="p-1.5 rounded hover:bg-border transition-colors"
                    title="編輯"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(holding)}
                    className="p-1.5 rounded hover:bg-border transition-colors text-danger"
                    title="刪除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
