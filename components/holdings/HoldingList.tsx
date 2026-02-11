'use client';

import { useState } from 'react';
import { Pencil, Trash2, TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react';
import type { AggregatedHolding, HoldingWithQuote } from '@/types';

interface Props {
  holdings: AggregatedHolding[];
  exchangeRate: number;
  totalValue: number;
  onEdit: (holding: HoldingWithQuote) => void;
  onDelete: (holding: HoldingWithQuote) => void;
  readOnly?: boolean;
}

export default function HoldingList({ holdings, exchangeRate, totalValue, onEdit, onDelete, readOnly = false }: Props) {
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());

  if (holdings.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <p>尚無持股資料</p>
        <p className="text-sm mt-1">點擊「新增持股」開始追蹤你的投資組合</p>
      </div>
    );
  }

  const toggleExpand = (symbol: string) => {
    setExpandedSymbols(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  const formatCurrency = (value: number, currency = 'TWD'): string => {
    if (value === null || value === undefined || isNaN(value)) return '—';
    const prefix = currency === 'USD' ? '$' : 'NT$';
    const formatted = Math.abs(value).toLocaleString('zh-TW', {
      minimumFractionDigits: 0,
      maximumFractionDigits: currency === 'TWD' ? 0 : 2,
    });
    return `${value < 0 ? '-' : ''}${prefix}${formatted}`;
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  // 依權重由高到低排序
  const sorted = holdings
    .map((h) => ({
      ...h,
      weight: totalValue > 0 ? ((h.currentValue || 0) / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.weight - a.weight);

  const renderGain = (gain: number, gainPercent: number, hasPrice: boolean) => {
    if (!hasPrice) return '—';
    const isPositive = gain >= 0;
    const prefix = gain >= 0 ? '+' : '';
    return (
      <div className={`flex flex-col items-end ${isPositive ? 'text-up' : 'text-down'}`}>
        <div className="flex items-center gap-1">
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span className="font-medium">{prefix}{gainPercent.toFixed(2)}%</span>
        </div>
        <span className="text-xs opacity-80">{prefix}{formatCurrency(gain, 'TWD')}</span>
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      {/* 桌面版表格 */}
      <table className="w-full hidden md:table">
        <thead>
          <tr className="text-left text-muted text-sm border-b border-border">
            <th className="pb-3 font-medium w-6"></th>
            <th className="pb-3 font-medium">代號</th>
            <th className="pb-3 font-medium text-right">股數</th>
            <th className="pb-3 font-medium text-right">均價</th>
            <th className="pb-3 font-medium text-right">買入總成本</th>
            <th className="pb-3 font-medium text-right">現價</th>
            <th className="pb-3 font-medium text-right">當前市值</th>
            <th className="pb-3 font-medium text-right">權重</th>
            <th className="pb-3 font-medium text-right">損益</th>
            <th className="pb-3 font-medium text-right">費用率</th>
            <th className="pb-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((holding) => {
            const currency = holding.market === 'US' ? 'USD' : 'TWD';
            const totalCost = Number(holding.shares) * Number(holding.cost_price);
            const hasPrice = holding.currentPrice && holding.currentPrice > 0;
            const hasMultipleLots = holding.lots.length > 1;
            const isExpanded = expandedSymbols.has(holding.symbol);

            return (
              <>
                {/* 聚合行 */}
                <tr
                  key={holding.symbol}
                  className={`border-b border-border hover:bg-card/50 transition-colors ${hasMultipleLots ? 'cursor-pointer' : ''}`}
                  onClick={() => hasMultipleLots && toggleExpand(holding.symbol)}
                >
                  <td className="py-3">
                    {hasMultipleLots ? (
                      isExpanded
                        ? <ChevronDown className="w-4 h-4 text-muted" />
                        : <ChevronRight className="w-4 h-4 text-muted" />
                    ) : null}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{holding.symbol}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-border text-muted">
                        {holding.market}
                      </span>
                      {hasMultipleLots && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                          {holding.lots.length} 筆
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-right">{Number(holding.shares).toLocaleString()}</td>
                  <td className="py-3 text-right">
                    {formatCurrency(Number(holding.cost_price), currency)}
                  </td>
                  <td className="py-3 text-right">
                    {formatCurrency(totalCost, currency)}
                  </td>
                  <td className="py-3 text-right">
                    {hasPrice
                      ? formatCurrency(holding.currentPrice!, currency)
                      : <span className="text-muted">載入中...</span>
                    }
                  </td>
                  <td className="py-3 text-right">
                    {hasPrice ? formatCurrency(holding.currentValue || 0, 'TWD') : '—'}
                  </td>
                  <td className="py-3 text-right font-medium">
                    {holding.weight > 0 ? `${holding.weight.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-3 text-right">
                    {renderGain(holding.gain || 0, holding.gainPercent || 0, !!hasPrice)}
                  </td>
                  <td className="py-3 text-right text-muted">
                    {holding.expenseRatio !== null && holding.expenseRatio !== undefined
                      ? `${(holding.expenseRatio * 100).toFixed(3)}%`
                      : '—'
                    }
                  </td>
                  <td className="py-3 text-right">
                    {/* 單一 lot 時直接顯示編輯刪除 */}
                    {!readOnly && !hasMultipleLots && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(holding.lots[0]); }}
                          className="p-1.5 rounded hover:bg-border transition-colors"
                          title="編輯"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(holding.lots[0]); }}
                          className="p-1.5 rounded hover:bg-border transition-colors text-danger"
                          title="刪除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>

                {/* 展開的子行（個別批次） */}
                {hasMultipleLots && isExpanded && holding.lots.map((lot) => {
                  const lotCurrency = lot.market === 'US' ? 'USD' : 'TWD';
                  const lotTotalCost = Number(lot.shares) * Number(lot.cost_price);
                  const lotHasPrice = lot.currentPrice && lot.currentPrice > 0;

                  return (
                    <tr
                      key={lot.id}
                      className="bg-card/30 border-b border-border/50 text-sm"
                    >
                      <td className="py-2"></td>
                      <td className="py-2 pl-4 text-muted">
                        └ {formatDate(lot.purchase_date)}
                      </td>
                      <td className="py-2 text-right text-muted">{Number(lot.shares).toLocaleString()}</td>
                      <td className="py-2 text-right text-muted">
                        {formatCurrency(Number(lot.cost_price), lotCurrency)}
                      </td>
                      <td className="py-2 text-right text-muted">
                        {formatCurrency(lotTotalCost, lotCurrency)}
                      </td>
                      <td className="py-2 text-right text-muted">—</td>
                      <td className="py-2 text-right text-muted">
                        {lotHasPrice ? formatCurrency(lot.currentValue || 0, 'TWD') : '—'}
                      </td>
                      <td className="py-2"></td>
                      <td className="py-2 text-right">
                        {renderGain(lot.gain || 0, lot.gainPercent || 0, !!lotHasPrice)}
                      </td>
                      <td className="py-2"></td>
                      <td className="py-2 text-right">
                        {!readOnly && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onEdit(lot)}
                              className="p-1.5 rounded hover:bg-border transition-colors"
                              title="編輯"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => onDelete(lot)}
                              className="p-1.5 rounded hover:bg-border transition-colors text-danger"
                              title="刪除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </>
            );
          })}
        </tbody>
      </table>

      {/* 手機版卡片 */}
      <div className="md:hidden space-y-3">
        {sorted.map((holding) => {
          const currency = holding.market === 'US' ? 'USD' : 'TWD';
          const totalCost = Number(holding.shares) * Number(holding.cost_price);
          const gain = holding.gain || 0;
          const gainPercent = holding.gainPercent || 0;
          const hasPrice = holding.currentPrice && holding.currentPrice > 0;
          const isPositive = gain >= 0;
          const hasMultipleLots = holding.lots.length > 1;
          const isExpanded = expandedSymbols.has(holding.symbol);

          const gainPrefix = gain >= 0 ? '+' : '';
          const gainPercentStr = `${gainPrefix}${gainPercent.toFixed(2)}%`;
          const gainAbsStr = `${gain >= 0 ? '+' : ''}${formatCurrency(gain, 'TWD')}`;

          return (
            <div key={holding.symbol} className="p-4 rounded-lg bg-card/50 border border-border">
              <div
                className="flex items-start justify-between mb-3"
                onClick={() => hasMultipleLots && toggleExpand(holding.symbol)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    {hasMultipleLots && (
                      isExpanded
                        ? <ChevronDown className="w-4 h-4 text-muted" />
                        : <ChevronRight className="w-4 h-4 text-muted" />
                    )}
                    <span className="font-medium">{holding.symbol}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-border text-muted">
                      {holding.market}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                      {holding.weight > 0 ? `${holding.weight.toFixed(1)}%` : '—'}
                    </span>
                    {hasMultipleLots && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-border text-muted">
                        {holding.lots.length} 筆
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted mt-0.5">
                    {Number(holding.shares).toLocaleString()} 股 @ {formatCurrency(Number(holding.cost_price), currency)}
                  </p>
                  <p className="text-xs text-muted">
                    總成本: {formatCurrency(totalCost, currency)}
                  </p>
                </div>
                <div className={`text-right ${isPositive ? 'text-up' : 'text-down'}`}>
                  {hasPrice ? (
                    <>
                      <div className="flex items-center justify-end gap-1">
                        {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
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

              {/* 展開的批次明細 */}
              {hasMultipleLots && isExpanded && (
                <div className="mt-2 pt-2 border-t border-border space-y-2">
                  {holding.lots.map((lot) => {
                    const lotCurrency = lot.market === 'US' ? 'USD' : 'TWD';
                    const lotGain = lot.gain || 0;
                    const lotIsPositive = lotGain >= 0;
                    return (
                      <div key={lot.id} className="flex items-center justify-between text-sm pl-2 border-l-2 border-border">
                        <div>
                          <p className="text-muted">
                            {formatDate(lot.purchase_date)} · {Number(lot.shares).toLocaleString()} 股 @ {formatCurrency(Number(lot.cost_price), lotCurrency)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={lotIsPositive ? 'text-up' : 'text-down'}>
                            {lotGain >= 0 ? '+' : ''}{(lot.gainPercent || 0).toFixed(2)}%
                          </span>
                          {!readOnly && (
                            <>
                              <button onClick={() => onEdit(lot)} className="p-1 rounded hover:bg-border" title="編輯">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button onClick={() => onDelete(lot)} className="p-1 rounded hover:bg-border text-danger" title="刪除">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 單一 lot 操作按鈕 */}
              {!hasMultipleLots && (
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {hasPrice && <span>現價: {formatCurrency(holding.currentPrice!, currency)}</span>}
                    {holding.expenseRatio !== null && holding.expenseRatio !== undefined && (
                      <span>費用率: {(holding.expenseRatio * 100).toFixed(3)}%</span>
                    )}
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-2 ml-auto">
                      <button onClick={() => onEdit(holding.lots[0])} className="p-1.5 rounded hover:bg-border transition-colors" title="編輯">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => onDelete(holding.lots[0])} className="p-1.5 rounded hover:bg-border transition-colors text-danger" title="刪除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
