"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  Plus,
  RefreshCw,
  LogOut,
  DollarSign,
  Percent,
  PieChart as PieChartIcon,
  Edit2,
  Check,
  X,
  History,
} from "lucide-react";
import type { Holding, HoldingWithQuote, AggregatedHolding } from "@/types";
import HoldingForm from "@/components/holdings/HoldingForm";
import SellForm from "@/components/holdings/SellForm";
import HoldingList from "@/components/holdings/HoldingList";
import PortfolioPieChart from "@/components/charts/PieChart";
import AssetTrendChart from "@/components/charts/AssetTrendChart";
import DailyPnLChart from "@/components/charts/DailyPnLChart";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PortfolioSelector from "@/components/portfolios/PortfolioSelector";

// 股價快取（避免重複請求）
const quoteCache = new Map<
  string,
  { price: number; currency: string; timestamp: number }
>();
const CACHE_TTL = 60000; // 1 分鐘快取

export default function DashboardPage() {
  const router = useRouter();
  const [holdings, setHoldings] = useState<HoldingWithQuote[]>([]);
  const [aggregatedHoldings, setAggregatedHoldings] = useState<AggregatedHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(32);
  const [totalValueTWD, setTotalValueTWD] = useState(0);
  const [totalCostTWD, setTotalCostTWD] = useState(0);
  const [totalGain, setTotalGain] = useState(0);
  const [totalGainPercent, setTotalGainPercent] = useState(0);
  const [weightedExpenseRatio, setWeightedExpenseRatio] = useState<
    number | null
  >(null);

  // 刪除確認對話框狀態
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    holdingId: string | null;
    holdingSymbol: string;
  }>({ isOpen: false, holdingId: null, holdingSymbol: "" });

  // 賣出彈窗狀態
  const [sellTarget, setSellTarget] = useState<HoldingWithQuote | null>(null);

  // 現金餘額狀態
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [isEditingCash, setIsEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState("");

  // 投資組合狀態（從 URL 取得返回參數）
  const [currentPortfolioId, setCurrentPortfolioId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('portfolio_id');
    }
    return null;
  });
  const [currentPortfolioName, setCurrentPortfolioName] =
    useState<string>(() => {
      if (typeof window !== 'undefined') {
        return new URLSearchParams(window.location.search).get('name') || '新的投資組合';
      }
      return '新的投資組合';
    });

  // 圖表刷新 key（變化時觸發圖表重新載入）
  const [chartRefreshKey, setChartRefreshKey] = useState<number>(0);

  // 用戶角色狀態
  const [userRole, setUserRole] = useState<"admin" | "guest" | null>(null);
  const isAdmin = userRole === "admin";

  // 載入持股資料
  const loadHoldings = useCallback(async () => {
    try {
      const url = currentPortfolioId
        ? `/api/holdings?portfolio_id=${currentPortfolioId}`
        : "/api/holdings";
      const res = await fetch(url);
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      return data as Holding[];
    } catch (err) {
      console.error("載入持股失敗:", err);
      return [];
    }
  }, [currentPortfolioId]);

  // 取得單一股票報價（帶快取）
  const fetchSingleQuote = useCallback(
    async (
      symbol: string,
    ): Promise<{ price: number; currency: string } | null> => {
      // 檢查快取
      const cached = quoteCache.get(symbol);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return { price: cached.price, currency: cached.currency };
      }

      try {
        const res = await fetch(
          `/api/stocks/quote?symbols=${encodeURIComponent(symbol)}`,
        );
        if (!res.ok) return null;

        const { data } = await res.json();
        if (!data) return null;

        const price = data.regularMarketPrice;
        const currency = data.currency || "USD";

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
    [],
  );

  // 取得匯率
  const fetchExchangeRate = useCallback(async () => {
    try {
      const res = await fetch("/api/exchange");
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
      const url = currentPortfolioId
        ? `/api/cash?portfolio_id=${currentPortfolioId}`
        : "/api/cash";
      const res = await fetch(url);
      const { data } = await res.json();
      return data?.amount_twd || 0;
    } catch {
      return 0;
    }
  }, [currentPortfolioId]);

  // 更新現金餘額
  const updateCashBalance = async (amount: number) => {
    try {
      const res = await fetch("/api/cash", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_twd: amount,
          portfolio_id: currentPortfolioId,
        }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setCashBalance(data?.amount_twd || amount);
      return true;
    } catch (err) {
      console.error("更新現金餘額失敗:", err);
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
      setAggregatedHoldings([]);
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
        const gainPercent =
          totalCostValue > 0 ? (gain / totalCostValue) * 100 : 0;

        // 換算成 TWD
        const isUS = holding.market === "US";
        const costTWD = isUS ? totalCostValue * rate : totalCostValue;
        const valueTWD = isUS ? currentValue * rate : currentValue;
        const gainTWD = valueTWD - costTWD;

        totalCost += costTWD;
        totalValue += valueTWD;

        // 由 API 自動判斷是否為 ETF 並取得費用率
        let expenseRatio = null;
        const expenseData = await fetchExpenseRatio(holding.symbol);
        if (expenseData !== null) {
          expenseRatio = expenseData;
          if (valueTWD > 0) {
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
      }),
    );

    setHoldings(enrichedHoldings);

    // 按 symbol 聚合持股（同一標的合併顯示）
    const grouped = Object.values(
      enrichedHoldings.reduce<Record<string, AggregatedHolding>>((acc, h) => {
        const key = h.symbol;
        if (!acc[key]) {
          acc[key] = { ...h, lots: [h] };
        } else {
          const g = acc[key];
          const newTotalCostTWD = (g.totalCostTWD || 0) + (h.totalCostTWD || 0);
          const newCurrentValue = (g.currentValue || 0) + (h.currentValue || 0);
          const newShares = Number(g.shares) + Number(h.shares);
          const newTotalCostOrig = (g.totalCost || 0) + (h.totalCost || 0);
          g.shares = newShares;
          g.totalCost = newTotalCostOrig;
          g.totalCostTWD = newTotalCostTWD;
          g.currentValue = newCurrentValue;
          g.gain = newCurrentValue - newTotalCostTWD;
          g.gainPercent = newTotalCostTWD > 0 ? ((newCurrentValue - newTotalCostTWD) / newTotalCostTWD) * 100 : 0;
          // 加權均價（原幣）
          g.cost_price = newTotalCostOrig / newShares;
          // 最早買入日期
          if (h.purchase_date < g.purchase_date) g.purchase_date = h.purchase_date;
          g.lots.push(h);
        }
        return acc;
      }, {})
    );
    setAggregatedHoldings(grouped);

    setTotalValueTWD(totalValue + cash); // 包含現金
    setTotalCostTWD(totalCost);
    setTotalGain(totalValue - totalCost);
    setTotalGainPercent(
      totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
    );
    setWeightedExpenseRatio(
      totalValue > 0 && etfWeightedSum > 0 ? etfWeightedSum / totalValue : null,
    );

    setLoading(false);
    setRefreshing(false);

    // 觸發圖表重新載入
    setChartRefreshKey((prev) => prev + 1);
  }, [
    loadHoldings,
    fetchExchangeRate,
    fetchSingleQuote,
    fetchExpenseRatio,
    loadCashBalance,
  ]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // 載入用戶角色
  useEffect(() => {
    const loadUserRole = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const { data } = await res.json();
        if (data?.role) {
          setUserRole(data.role);
        }
      } catch (err) {
        console.error("載入用戶角色失敗:", err);
      }
    };
    loadUserRole();
  }, []);

  // 登出
  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/");
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
      await fetch(`/api/holdings/${deleteConfirm.holdingId}`, {
        method: "DELETE",
      });
      setDeleteConfirm({ isOpen: false, holdingId: null, holdingSymbol: "" });
      refreshData();
    } catch (err) {
      console.error("刪除持股失敗:", err);
    }
  };

  // 取消刪除
  const handleDeleteCancel = () => {
    setDeleteConfirm({ isOpen: false, holdingId: null, holdingSymbol: "" });
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
    setCashInput("");
  };

  // 格式化金額
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
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

  // 圓餅圖資料（用聚合後持股 + 現金）
  const pieChartData = [
    ...aggregatedHoldings.map((h) => ({
      name: h.symbol,
      value: h.currentValue || 0,
    })),
    ...(cashBalance > 0 ? [{ name: "現金", value: cashBalance }] : []),
  ];

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-primary" />
          <h1 className="text-xl md:text-2xl font-bold">
            Portfolio Visualizer
          </h1>
          <PortfolioSelector
            currentPortfolioId={currentPortfolioId}
            onSelectPortfolio={(portfolio) => {
              setCurrentPortfolioId(portfolio.id);
              setCurrentPortfolioName(portfolio.name);
            }}
            readOnly={!isAdmin}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (currentPortfolioId) params.set('portfolio_id', currentPortfolioId);
              if (currentPortfolioName) params.set('name', currentPortfolioName);
              const qs = params.toString();
              router.push(`/transactions${qs ? `?${qs}` : ''}`);
            }}
            className="p-2 rounded-lg hover:bg-card transition-colors"
            title="交易紀錄"
          >
            <History className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              quoteCache.clear();
              refreshData();
            }}
            disabled={refreshing}
            className="p-2 rounded-lg hover:bg-card transition-colors"
            title="重新整理"
          >
            <RefreshCw
              className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
            />
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

      {/* 上方：左側 2×2 卡片 + 右側資產配置 */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 mb-6">
        {/* 左側 2×2 小卡片 */}
        <div className="grid grid-cols-2 gap-4">
          {/* 總資產 */}
          <div className="card">
            <div className="flex items-center gap-2 text-muted mb-2">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm">總資產</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalValueTWD)}</p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between text-muted">
                <span className="font-medium">股票</span>
                <span>
                  {formatCurrency(totalValueTWD - cashBalance)}
                  {totalValueTWD > 0 && (
                    <span className="ml-1 text-xs">
                      ({(((totalValueTWD - cashBalance) / totalValueTWD) * 100).toFixed(1)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span className="flex items-center gap-1 font-medium">
                  現金
                  {!isEditingCash && isAdmin && (
                    <button
                      onClick={handleEditCash}
                      className="p-0.5 rounded hover:bg-border transition-colors"
                      title="編輯現金"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </span>
                {isEditingCash ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={cashInput}
                      onChange={(e) => setCashInput(e.target.value)}
                      className="w-24 px-1.5 py-0.5 bg-background border border-border rounded text-sm text-right"
                      placeholder="0"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveCash}
                      className="p-1 rounded bg-up text-white hover:bg-up/80"
                      title="儲存"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={handleCancelCash}
                      className="p-1 rounded bg-border hover:bg-border/80"
                      title="取消"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <span>
                    {formatCurrency(cashBalance)}
                    {totalValueTWD > 0 && (
                      <span className="ml-1 text-xs">
                        ({((cashBalance / totalValueTWD) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 持股分佈 */}
          <div className="card">
            <div className="flex items-center gap-2 text-muted mb-2">
              <PieChartIcon className="w-4 h-4" />
              <span className="text-sm">持股分佈</span>
            </div>
            <div className="space-y-2">
              <p className="text-lg font-bold">
                台股 {aggregatedHoldings.filter((h) => h.market === "TW").length} 檔 / 美股{" "}
                {aggregatedHoldings.filter((h) => h.market === "US").length} 檔
              </p>
              <div className="text-sm space-y-1">
                {(() => {
                  const twValue = aggregatedHoldings
                    .filter((h) => h.market === "TW")
                    .reduce((sum, h) => sum + (h.currentValue || 0), 0);
                  const usValue = aggregatedHoldings
                    .filter((h) => h.market === "US")
                    .reduce((sum, h) => sum + (h.currentValue || 0), 0);
                  const twWeight =
                    totalValueTWD > 0 ? (twValue / totalValueTWD) * 100 : 0;
                  const usWeight =
                    totalValueTWD > 0 ? (usValue / totalValueTWD) * 100 : 0;
                  const cashWeight =
                    totalValueTWD > 0 ? (cashBalance / totalValueTWD) * 100 : 0;
                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted font-medium">台股</span>
                        <span className="font-medium">{twWeight.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted font-medium">美股</span>
                        <span className="font-medium">{usWeight.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted font-medium">現金</span>
                        <span className="font-medium">{cashWeight.toFixed(1)}%</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* 總損益 */}
          <div className="card">
            <div className="flex items-center gap-2 text-muted mb-2">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm">總損益</span>
            </div>
            <p
              className={`text-2xl font-bold ${totalGain >= 0 ? "text-up" : "text-down"}`}
            >
              {totalGain >= 0 ? "+" : ""}
              {formatCurrency(totalGain)}
            </p>
            <p className={`text-sm ${totalGain >= 0 ? "text-up" : "text-down"}`}>
              {totalGainPercent >= 0 ? "+" : ""}
              {totalGainPercent.toFixed(2)}%
            </p>
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
                : "—"}
            </p>
          </div>
        </div>

        {/* 右側資產配置圓餅圖 */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">資產配置</h2>
          {pieChartData.length > 0 && pieChartData.some((d) => d.value > 0) ? (
            <PortfolioPieChart holdings={aggregatedHoldings} cashBalance={cashBalance} />
          ) : (
            <div className="h-64 flex items-center justify-center text-muted">
              尚無資產資料
            </div>
          )}
        </div>
      </div>

      {/* 下方圖表：2 欄 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 總資產走勢圖 */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">總資產走勢</h2>
          <div className="h-[350px]">
            <AssetTrendChart
              portfolioId={currentPortfolioId}
              refreshKey={chartRefreshKey}
            />
          </div>
        </div>

        {/* 每日損益變化圖 */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">每日損益變化</h2>
          <div className="h-[350px]">
            <DailyPnLChart
              portfolioId={currentPortfolioId}
              refreshKey={chartRefreshKey}
            />
          </div>
        </div>
      </div>

      {/* 持股清單 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">持股清單</h2>
          {isAdmin && (
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">新增持股</span>
            </button>
          )}
        </div>

        <HoldingList
          holdings={aggregatedHoldings}
          exchangeRate={exchangeRate}
          totalValue={totalValueTWD}
          onEdit={(h) => {
            setEditingHolding(h);
            setShowForm(true);
          }}
          onDelete={handleDeleteClick}
          onSell={isAdmin ? (h) => setSellTarget(h) : undefined}
          readOnly={!isAdmin}
        />
      </div>

      {/* 新增/編輯表單彈窗 */}
      {showForm && (
        <HoldingForm
          holding={editingHolding}
          portfolioId={currentPortfolioId}
          onClose={() => {
            setShowForm(false);
            setEditingHolding(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* 賣出彈窗 */}
      {sellTarget && (
        <SellForm
          holding={sellTarget}
          portfolioId={currentPortfolioId}
          exchangeRate={exchangeRate}
          onClose={() => setSellTarget(null)}
          onSuccess={() => {
            setSellTarget(null);
            refreshData();
          }}
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
