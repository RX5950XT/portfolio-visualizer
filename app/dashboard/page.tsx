'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  Plus,
  RefreshCw,
  LogOut,
  DollarSign,
  Percent,
  PieChart as PieChartIcon,
  Wallet,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import type { Holding, HoldingWithQuote } from '@/types';
import HoldingForm from '@/components/holdings/HoldingForm';
import HoldingList from '@/components/holdings/HoldingList';
import PortfolioPieChart from '@/components/charts/PieChart';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// 股價快取（避免重複請求）
const quoteCache = new Map<
  string,
  { price: number; currency: string; timestamp: number }
>();
const CACHE_TTL = 60000; // 1 分鐘快取

export default function DashboardPage() {
  const router = useRouter();
  const [holdings, setHoldings] = useState<HoldingWithQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(32);
  const [totalValueTWD, setTotalValueTWD] = useState(0);
  const [totalCostTWD, setTotalCostTWD] = useState(0);
  const [totalGain, setTotalGain] = useState(0);
  const [totalGainPercent, setTotalGainPercent] = useState(0);
  const [weightedExpenseRatio, setWeightedExpenseRatio] = useState<number | null>(null);

  // 刪除確認對話框狀態
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    holdingId: string | null;
    holdingSymbol: string;
  }>({ isOpen: false, holdingId: null, holdingSymbol: '' });

  // 現金餘額狀態
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [isEditingCash, setIsEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');

  // 載入持股資料
  const loadHoldings = useCallback(async () => {
    try {
      const res = await fetch('/api/holdings');
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      return data as Holding[];
    } catch (err) {
      console.error('載入持股失敗:', err);
      return [];
    }
  }, []);

  // 取得單一股票報價（帶快取）
  const fetchSingleQuote = useCallback(
    async (symbol: string): Promise<{ price: number; currency: string } | null> => {
      // 檢查快取
      const cached = quoteCache.get(symbol);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return { price: cached.price, currency: cached.currency };
      }

      try {
        const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(symbol)}`);
        if (!res.ok) return null;

        const { data } = await res.json();
        if (!data) return null;

        const price = data.regularMarketPrice;
        const currency = data.currency || 'USD';

        if (price && price > 0) {
          quoteCache.set(symbol, { price, currency, timestamp: Date.now() });
          return { price, currency };
        }
        return null;
      } catch {
        console.error(`取得 ${symbol} 報價失敗`);
        return null;
      }
    },
    []
  );

  // 取得匯率
  const fetchExchangeRate = useCallback(async () => {
    try {
      const res = await fetch('/api/exchange');
      const { data } = await res.json();
      return data?.rate || 32;
    } catch {
      return 32;
    }
  }, []);

  // 取得 ETF 費用率
  const fetchExpenseRatio = useCallback(async (symbol: string) => {
    try {
      const res = await fetch(`/api/etf/expense?symbol=${symbol}`);
      const { data } = await res.json();
      return data?.expense_ratio || null;
    } catch {
      return null;
    }
  }, []);

  // 取得現金餘額
  const loadCashBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/cash');
      const { data } = await res.json();
      return data?.amount_twd || 0;
    } catch {
      return 0;
    }
  }, []);

  // 更新現金餘額
  const updateCashBalance = async (amount: number) => {
    try {
      const res = await fetch('/api/cash', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_twd: amount }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setCashBalance(data?.amount_twd || amount);
      return true;
    } catch (err) {
      console.error('更新現金餘額失敗:', err);
      return false;
    }
  };

  // 整合所有資料
  const refreshData = useCallback(async () => {
    setRefreshing(true);

    const [holdingsData, rate, cash] = await Promise.all([
      loadHoldings(),
      fetchExchangeRate(),
      loadCashBalance(),
    ]);

    setExchangeRate(rate);
    setCashBalance(cash);

    if (holdingsData.length === 0) {
      setHoldings([]);
      setTotalValueTWD(cash); // 只有現金
      setTotalCostTWD(0);
      setTotalGain(0);
      setTotalGainPercent(0);
      setWeightedExpenseRatio(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // 逐一取得報價（確保格式一致）
    let totalCost = 0;
    let totalValue = 0;
    let etfTotalValue = 0;
    let etfWeightedSum = 0;

    const enrichedHoldings: HoldingWithQuote[] = await Promise.all(
      holdingsData.map(async (holding) => {
        const quote = await fetchSingleQuote(holding.symbol);

        const currentPrice = quote?.price || 0;
        const costPerShare = Number(holding.cost_price);
        const shares = Number(holding.shares);
        const totalCostValue = shares * costPerShare;
        const currentValue = shares * currentPrice;
        const gain = currentValue - totalCostValue;
        const gainPercent = totalCostValue > 0 ? (gain / totalCostValue) * 100 : 0;

        // 換算成 TWD
        const isUS = holding.market === 'US';
        const costTWD = isUS ? totalCostValue * rate : totalCostValue;
        const valueTWD = isUS ? currentValue * rate : currentValue;
        const gainTWD = valueTWD - costTWD;

        totalCost += costTWD;
        totalValue += valueTWD;

        // 檢查是否為 ETF 並取得費用率
        let expenseRatio = null;
        const isLikelyETF =
          /^[A-Z]{2,5}$/.test(holding.symbol) ||
          (holding.symbol.includes('.TW') && /^\d{4,5}\.TW/.test(holding.symbol));

        if (isLikelyETF) {
          expenseRatio = await fetchExpenseRatio(holding.symbol);
          if (expenseRatio !== null && valueTWD > 0) {
            etfTotalValue += valueTWD;
            etfWeightedSum += valueTWD * expenseRatio;
          }
        }

        return {
          ...holding,
          shares,
          cost_price: costPerShare,
          totalCost: totalCostValue,
          totalCostTWD: costTWD,
          currentPrice,
          currentValue: valueTWD,
          gain: gainTWD,
          gainPercent,
          expenseRatio,
        };
      })
    );

    setHoldings(enrichedHoldings);
    setTotalValueTWD(totalValue + cash); // 包含現金
    setTotalCostTWD(totalCost);
    setTotalGain(totalValue - totalCost);
    setTotalGainPercent(totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0);
    setWeightedExpenseRatio(etfTotalValue > 0 ? etfWeightedSum / etfTotalValue : null);

    setLoading(false);
    setRefreshing(false);
  }, [loadHoldings, fetchExchangeRate, fetchSingleQuote, fetchExpenseRatio, loadCashBalance]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // 登出
  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/');
  };

  // 新增/編輯成功後刷新
  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingHolding(null);
    quoteCache.clear();
    refreshData();
  };

  // 開啟刪除確認對話框
  const handleDeleteClick = (holding: HoldingWithQuote) => {
    setDeleteConfirm({
      isOpen: true,
      holdingId: holding.id,
      holdingSymbol: holding.symbol,
    });
  };

  // 確認刪除
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.holdingId) return;

    try {
      await fetch(`/api/holdings/${deleteConfirm.holdingId}`, { method: 'DELETE' });
      setDeleteConfirm({ isOpen: false, holdingId: null, holdingSymbol: '' });
      refreshData();
    } catch (err) {
      console.error('刪除持股失敗:', err);
    }
  };

  // 取消刪除
  const handleDeleteCancel = () => {
    setDeleteConfirm({ isOpen: false, holdingId: null, holdingSymbol: '' });
  };

  // 開始編輯現金
  const handleEditCash = () => {
    setCashInput(cashBalance.toString());
    setIsEditingCash(true);
  };

  // 儲存現金
  const handleSaveCash = async () => {
    const amount = parseFloat(cashInput) || 0;
    const success = await updateCashBalance(amount);
    if (success) {
      setIsEditingCash(false);
      refreshData();
    }
  };

  // 取消編輯現金
  const handleCancelCash = () => {
    setIsEditingCash(false);
    setCashInput('');
  };

  // 格式化金額
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // 圓餅圖資料（包含現金）
  const pieChartData = [
    ...holdings.map((h) => ({
      name: h.symbol,
      value: h.currentValue || 0,
    })),
    ...(cashBalance > 0 ? [{ name: '現金', value: cashBalance }] : []),
  ];

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-primary" />
          <h1 className="text-xl md:text-2xl font-bold">Portfolio Visualizer</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              quoteCache.clear();
              refreshData();
            }}
            disabled={refreshing}
            className="p-2 rounded-lg hover:bg-card transition-colors"
            title="重新整理"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-card transition-colors text-muted hover:text-danger"
            title="登出"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 總覽卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* 總資產 */}
        <div className="card">
          <div className="flex items-center gap-2 text-muted mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">總資產</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalValueTWD)}</p>
          <p className="text-xs text-muted mt-1">
            成本: {formatCurrency(totalCostTWD)} | 匯率: {exchangeRate.toFixed(2)}
          </p>
        </div>

        {/* 總損益 */}
        <div className="card">
          <div className="flex items-center gap-2 text-muted mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">總損益</span>
          </div>
          <p className={`text-2xl font-bold ${totalGain >= 0 ? 'text-up' : 'text-down'}`}>
            {totalGain >= 0 ? '+' : ''}
            {formatCurrency(totalGain)}
          </p>
          <p className={`text-sm ${totalGain >= 0 ? 'text-up' : 'text-down'}`}>
            {totalGainPercent >= 0 ? '+' : ''}
            {totalGainPercent.toFixed(2)}%
          </p>
        </div>

        {/* 現金餘額 */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-muted">
              <Wallet className="w-4 h-4" />
              <span className="text-sm">現金 (TWD)</span>
            </div>
            {!isEditingCash && (
              <button
                onClick={handleEditCash}
                className="p-1 rounded hover:bg-border transition-colors text-muted"
                title="編輯現金"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </div>
          {isEditingCash ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                className="w-full px-2 py-1 bg-background border border-border rounded text-lg"
                placeholder="0"
                autoFocus
              />
              <button
                onClick={handleSaveCash}
                className="p-1.5 rounded bg-up text-white hover:bg-up/80"
                title="儲存"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancelCash}
                className="p-1.5 rounded bg-border hover:bg-border/80"
                title="取消"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-2xl font-bold">{formatCurrency(cashBalance)}</p>
          )}
        </div>

        {/* 持股數量 */}
        <div className="card">
          <div className="flex items-center gap-2 text-muted mb-2">
            <PieChartIcon className="w-4 h-4" />
            <span className="text-sm">持股數量</span>
          </div>
          <p className="text-2xl font-bold">{holdings.length}</p>
        </div>

        {/* ETF 加權費用率 */}
        <div className="card">
          <div className="flex items-center gap-2 text-muted mb-2">
            <Percent className="w-4 h-4" />
            <span className="text-sm">ETF 加權費用率</span>
          </div>
          <p className="text-2xl font-bold">
            {weightedExpenseRatio !== null
              ? `${(weightedExpenseRatio * 100).toFixed(3)}%`
              : '—'}
          </p>
        </div>
      </div>

      {/* 圖表區 - 3 欄 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* 資產配置圓餅圖 */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">資產配置</h2>
          {pieChartData.length > 0 && pieChartData.some((d) => d.value > 0) ? (
            <PortfolioPieChart holdings={holdings} cashBalance={cashBalance} />
          ) : (
            <div className="h-64 flex items-center justify-center text-muted">
              尚無資產資料
            </div>
          )}
        </div>

        {/* 總資產走勢圖 */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">總資產走勢</h2>
          <div className="h-64 flex items-center justify-center text-muted">
            累積快照數據後將顯示走勢圖
          </div>
        </div>

        {/* 損益走勢圖 */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">損益走勢 (近 7 天)</h2>
          <div className="h-64 flex items-center justify-center text-muted">
            累積快照數據後將顯示走勢圖
          </div>
        </div>
      </div>

      {/* 持股清單 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">持股清單</h2>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">新增持股</span>
          </button>
        </div>

        <HoldingList
          holdings={holdings}
          exchangeRate={exchangeRate}
          onEdit={(h) => {
            setEditingHolding(h);
            setShowForm(true);
          }}
          onDelete={handleDeleteClick}
        />
      </div>

      {/* 新增/編輯表單彈窗 */}
      {showForm && (
        <HoldingForm
          holding={editingHolding}
          onClose={() => {
            setShowForm(false);
            setEditingHolding(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* 刪除確認對話框 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="確認刪除"
        message={`確定要刪除持股「${deleteConfirm.holdingSymbol}」嗎？此操作無法復原。`}
        confirmText="刪除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}
