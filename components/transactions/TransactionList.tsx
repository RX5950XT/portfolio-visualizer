'use client';

import { TrendingUp, TrendingDown, Trash2, Pencil } from 'lucide-react';
import type { Transaction } from '@/types';

interface Props {
  transactions: Transaction[];
  onDelete?: (ids: string[], symbol: string) => void;
  onEditNotes?: (ids: string[], symbol: string, currentNotes: string | null) => void;
  readOnly?: boolean;
}

// 一次賣出可能被 pro-rata 拆成多筆 tx（每批次一筆），顯示層聚合回單次賣出
interface SaleGroup {
  key: string;
  ids: string[];
  symbol: string;
  market: 'US' | 'TW';
  transaction_date: string;
  price: number;
  shares: number;
  realizedPnl: number | null;
  notes: string | null;
}

// 同 (日期, 標的, 市場, 成交價, created_at) 視為同一次賣出；
// pro-rata 多筆 tx 在單一 insert 內寫入 → created_at 相同 → 聚合為一組
function groupSales(transactions: Transaction[]): SaleGroup[] {
  const map = new Map<string, SaleGroup>();
  for (const tx of transactions) {
    const key = `${tx.transaction_date}|${tx.symbol}|${tx.market}|${tx.price}|${tx.created_at}`;
    const existing = map.get(key);
    if (existing) {
      existing.ids.push(tx.id);
      existing.shares += Number(tx.shares);
      if (tx.realized_pnl_twd != null) {
        existing.realizedPnl = (existing.realizedPnl ?? 0) + tx.realized_pnl_twd;
      }
    } else {
      map.set(key, {
        key,
        ids: [tx.id],
        symbol: tx.symbol,
        market: tx.market,
        transaction_date: tx.transaction_date,
        price: Number(tx.price),
        shares: Number(tx.shares),
        realizedPnl: tx.realized_pnl_twd ?? null,
        notes: tx.notes,
      });
    }
  }
  return [...map.values()];
}

export default function TransactionList({ transactions, onDelete, onEditNotes, readOnly = false }: Props) {
  const showActions = !readOnly && Boolean(onDelete || onEditNotes);

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <p>尚無賣出紀錄</p>
      </div>
    );
  }

  const groups = groupSales(transactions);

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
            {showActions && (
              <th className="pb-3 font-medium text-center w-[90px]">操作</th>
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const currency = g.market === 'US' ? 'USD' : 'TWD';
            const amount = g.shares * g.price;
            const pnl = g.realizedPnl;

            return (
              <tr key={g.key} className="border-b border-border hover:bg-card/50 transition-colors">
                <td className="py-3 text-sm">{formatDate(g.transaction_date)}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{g.symbol}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-border text-muted">
                      {g.market}
                    </span>
                  </div>
                </td>
                <td className="py-3 text-right">{g.shares.toLocaleString()}</td>
                <td className="py-3 text-right">{formatCurrency(g.price, currency)}</td>
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
                <td className="py-3 text-sm text-muted pl-6 truncate">{g.notes || '—'}</td>
                {showActions && (
                  <td className="py-3">
                    <div className="flex items-center justify-center gap-1">
                      {onEditNotes && (
                        <button
                          onClick={() => onEditNotes(g.ids, g.symbol, g.notes)}
                          className="p-1.5 rounded hover:bg-border transition-colors text-muted hover:text-foreground"
                          title="編輯備註"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(g.ids, g.symbol)}
                          className="p-1.5 rounded hover:bg-border transition-colors text-danger"
                          title="刪除紀錄"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 手機版卡片 */}
      <div className="md:hidden space-y-3">
        {groups.map((g) => {
          const currency = g.market === 'US' ? 'USD' : 'TWD';
          const pnl = g.realizedPnl;

          return (
            <div key={g.key} className="p-4 rounded-lg bg-card/50 border border-border">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{g.symbol}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-border text-muted">
                      {g.market}
                    </span>
                  </div>
                  <p className="text-sm text-muted mt-1">
                    {formatDate(g.transaction_date)}
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
                  {showActions && (
                    <>
                      {onEditNotes && (
                        <button
                          onClick={() => onEditNotes(g.ids, g.symbol, g.notes)}
                          className="p-1 rounded hover:bg-border text-muted hover:text-foreground"
                          title="編輯備註"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(g.ids, g.symbol)}
                          className="p-1 rounded hover:bg-border text-danger"
                          title="刪除紀錄"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="text-sm text-muted space-y-0.5">
                <p>{g.shares.toLocaleString()} 股 @ {formatCurrency(g.price, currency)}</p>
                {g.notes && <p className="text-xs">備註：{g.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
