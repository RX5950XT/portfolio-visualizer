'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Holding } from '@/types';

interface Props {
  holding: Holding | null;
  portfolioId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function HoldingForm({ holding, portfolioId, onClose, onSuccess }: Props) {
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!holding;

  useEffect(() => {
    if (holding) {
      setSymbol(holding.symbol);
      setShares(holding.shares.toString());
      setCostPrice(holding.cost_price.toString());
      setPurchaseDate(holding.purchase_date);
    }
  }, [holding]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const body: {
      symbol: string;
      shares: number;
      cost_price: number;
      purchase_date: string;
      portfolio_id?: string;
    } = {
      symbol: symbol.toUpperCase(),
      shares: parseFloat(shares),
      cost_price: parseFloat(costPrice),
      purchase_date: purchaseDate,
    };

    // 新增時才加入 portfolio_id
    if (!isEditing && portfolioId) {
      body.portfolio_id = portfolioId;
    }

    try {
      const url = isEditing ? `/api/holdings/${holding.id}` : '/api/holdings';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '操作失敗');
        return;
      }

      onSuccess();
    } catch {
      setError('網路錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="card w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? '編輯持股' : '新增持股'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-border transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 股票代號 */}
          <div>
            <label className="block text-sm text-muted mb-1">
              股票代號 *
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="例如: AAPL, 2330.TW"
              className="w-full"
              required
            />
            <p className="text-xs text-muted mt-1">
              台股請加 .TW（上市）或 .TWO（上櫃）
            </p>
          </div>

          {/* 股數 */}
          <div>
            <label className="block text-sm text-muted mb-1">
              持股數量 *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="例如: 100"
              className="w-full"
              required
            />
          </div>

          {/* 成本價 */}
          <div>
            <label className="block text-sm text-muted mb-1">
              每股成本價 *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="例如: 150.50"
              className="w-full"
              required
            />
          </div>

          {/* 買入日期 */}
          <div>
            <label className="block text-sm text-muted mb-1">
              買入日期 *
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full"
              required
            />
          </div>

          {error && (
            <p className="text-danger text-sm">{error}</p>
          )}

          {/* 按鈕 */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-border hover:bg-border transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1"
            >
              {loading ? '處理中...' : isEditing ? '儲存' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
