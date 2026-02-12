'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { HoldingWithQuote } from '@/types';

interface Props {
  holding: HoldingWithQuote;
  portfolioId?: string | null;
  exchangeRate: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SellForm({ holding, portfolioId, exchangeRate, onClose, onSuccess }: Props) {
  const [shares, setShares] = useState('');
  const [sellPrice, setSellPrice] = useState(
    holding.currentPrice ? holding.currentPrice.toString() : ''
  );
  const [sellDate, setSellDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currency = holding.market === 'US' ? 'USD' : 'TWD';
  const maxShares = Number(holding.shares);
  const costPrice = Number(holding.cost_price);

  // 即時預覽已實現損益
  const sellSharesNum = parseFloat(shares) || 0;
  const sellPriceNum = parseFloat(sellPrice) || 0;
  const rate = holding.market === 'US' ? exchangeRate : 1;
  const previewPnl = (sellPriceNum - costPrice) * sellSharesNum * rate;
  const previewAmount = sellPriceNum * sellSharesNum * rate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (sellSharesNum <= 0) {
      setError('賣出股數必須大於 0');
      return;
    }
    if (sellSharesNum > maxShares) {
      setError(`賣出股數不能超過持有量 (${maxShares})`);
      return;
    }
    if (sellPriceNum <= 0) {
      setError('成交價必須大於 0');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holding_id: holding.id,
          shares: sellSharesNum,
          price: sellPriceNum,
          transaction_date: sellDate,
          portfolio_id: portfolioId || null,
          notes: notes || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '賣出失敗');
        return;
      }

      onSuccess();
    } catch {
      setError('網路錯誤');
    } finally {
      setLoading(false);
    }
  };

  const handleSellAll = () => {
    setShares(maxShares.toString());
  };

  const formatCurrency = (value: number, cur = 'TWD'): string => {
    const prefix = cur === 'USD' ? '$' : 'NT$';
    const formatted = Math.abs(value).toLocaleString('zh-TW', {
      minimumFractionDigits: 0,
      maximumFractionDigits: cur === 'TWD' ? 0 : 2,
    });
    return `${value < 0 ? '-' : ''}${prefix}${formatted}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="card w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            賣出 {holding.symbol}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-border transition-colors"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 持股資訊 */}
        <div className="bg-background rounded-lg p-3 mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">持有股數</span>
            <span className="font-medium">{maxShares.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">成本均價</span>
            <span className="font-medium">{formatCurrency(costPrice, currency)}</span>
          </div>
          {holding.currentPrice && holding.currentPrice > 0 && (
            <div className="flex justify-between">
              <span className="text-muted">目前股價</span>
              <span className="font-medium">{formatCurrency(holding.currentPrice, currency)}</span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 賣出股數 */}
          <div>
            <label className="block text-sm text-muted mb-1">
              賣出股數 *
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                min="0"
                max={maxShares}
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder={`最多 ${maxShares}`}
                className="w-full"
                required
              />
              <button
                type="button"
                onClick={handleSellAll}
                className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-border transition-colors whitespace-nowrap"
              >
                全部
              </button>
            </div>
          </div>

          {/* 成交價 */}
          <div>
            <label className="block text-sm text-muted mb-1">
              成交價 ({currency}) *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="賣出成交價"
              className="w-full"
              required
            />
          </div>

          {/* 賣出日期 */}
          <div>
            <label className="block text-sm text-muted mb-1">
              賣出日期 *
            </label>
            <input
              type="date"
              value={sellDate}
              onChange={(e) => setSellDate(e.target.value)}
              className="w-full"
              title="賣出日期"
              required
            />
          </div>

          {/* 備註 */}
          <div>
            <label className="block text-sm text-muted mb-1">
              備註（選填）
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如：停損、獲利了結"
              className="w-full"
            />
          </div>

          {/* 損益預覽 */}
          {sellSharesNum > 0 && sellPriceNum > 0 && (
            <div className="bg-background rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">賣出金額</span>
                <span className="font-medium">{formatCurrency(previewAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">已實現損益</span>
                <span className={`font-medium ${previewPnl >= 0 ? 'text-up' : 'text-down'}`}>
                  {previewPnl >= 0 ? '+' : ''}{formatCurrency(previewPnl)}
                </span>
              </div>
            </div>
          )}

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
              className="flex-1 py-2 rounded-lg bg-danger text-white hover:bg-danger/90 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? '處理中...' : '確認賣出'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
