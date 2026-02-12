'use client';

import { TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import type { Transaction } from '@/types';

interface Props {
  transactions: Transaction[];
  onDelete?: (tx: Transaction) => void;
  readOnly?: boolean;
}

export default function TransactionList({ transactions, onDelete, readOnly = false }: Props) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <p>尚無賣出紀錄</p>
      </div>
    );
  }

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

  return (
    <div className="overflow-x-auto">
      {/* 桌面版表格 */}
      <table className="w-full hidden md:table table-fixed">
        <thead>
          <tr className="text-left text-muted text-sm border-b border-border">
            <th className="pb-3 font-medium w-[100px]">日期</th>
            <th className="pb-3 font-medium w-[120px]">代號</th>
            <th className="pb-3 font-medium text-right w-[80px]">股數</th>
            <th className="pb-3 font-medium text-right w-[100px]">成交價</th>
            <th className="pb-3 font-medium text-right w-[120px]">成交金額</th>
            <th className="pb-3 font-medium text-right w-[150px]">已實現損益</th>
            <th className="pb-3 font-medium w-[120px] pl-6">備註</th>
            {!readOnly && onDelete && (
              <th className="pb-3 font-medium text-center w-[60px]">操作</th>
            )}
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const currency = tx.market === 'US' ? 'USD' : 'TWD';
            const amount = tx.shares * tx.price;
            const pnl = tx.realized_pnl_twd;

            return (
              <tr key={tx.id} className="border-b border-border hover:bg-card/50 transition-colors">
                <td className="py-3 text-sm">{formatDate(tx.transaction_date)}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tx.symbol}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-border text-muted">
                      {tx.market}
                    </span>
                  </div>
                </td>
                <td className="py-3 text-right">{Number(tx.shares).toLocaleString()}</td>
                <td className="py-3 text-right">{formatCurrency(Number(tx.price), currency)}</td>
                <td className="py-3 text-right">{formatCurrency(amount, currency)}</td>
                <td className="py-3 text-right">
                  {pnl !== null && pnl !== undefined ? (
                    <div className={`flex items-center justify-end gap-1 ${pnl >= 0 ? 'text-up' : 'text-down'}`}>
                      {pnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      <span className="font-medium">
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-3 text-sm text-muted pl-6 truncate">{tx.notes || '—'}</td>
                {!readOnly && onDelete && (
                  <td className="py-3 text-center">
                    <button
                      onClick={() => onDelete(tx)}
                      className="p-1.5 rounded hover:bg-border transition-colors text-danger"
                      title="刪除紀錄"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 手機版卡片 */}
      <div className="md:hidden space-y-3">
        {transactions.map((tx) => {
          const currency = tx.market === 'US' ? 'USD' : 'TWD';
          const pnl = tx.realized_pnl_twd;

          return (
            <div key={tx.id} className="p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tx.symbol}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-border text-muted">
                      {tx.market}
                    </span>
                  </div>
                  <p className="text-sm text-muted mt-1">
                    {formatDate(tx.transaction_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {pnl !== null && pnl !== undefined && (
                    <div className={`text-right ${pnl >= 0 ? 'text-up' : 'text-down'}`}>
                      <div className="flex items-center gap-1">
                        {pnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="font-medium">
                          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                        </span>
                      </div>
                    </div>
                  )}
                  {!readOnly && onDelete && (
                    <button
                      onClick={() => onDelete(tx)}
                      className="p-1 rounded hover:bg-border text-danger"
                      title="刪除紀錄"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="text-sm text-muted space-y-0.5">
                <p>{Number(tx.shares).toLocaleString()} 股 @ {formatCurrency(Number(tx.price), currency)}</p>
                {tx.notes && <p className="text-xs">備註：{tx.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
