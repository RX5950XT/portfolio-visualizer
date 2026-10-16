"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  Plus,
  RefreshCw,
  LogOut,
  DollarSign,
  Edit2,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Check,
  X,
  Settings,
} from "lucide-react";
import type { Holding, HoldingWithQuote, AggregatedHolding } from "@/types";
import HoldingForm from "@/components/holdings/HoldingForm";
import SellForm from "@/components/holdings/SellForm";
import HoldingList from "@/components/holdings/HoldingList";
import PortfolioPieChart from "@/components/charts/PieChart";
import AssetTrendChart from "@/components/charts/AssetTrendChart";
import BenchmarkToggle from "@/components/charts/BenchmarkToggle";
import AnalysisPanels from "@/components/AnalysisPanels";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PortfolioSelector from "@/components/portfolios/PortfolioSelector";
import Logo from "@/components/Logo";

// 股價快取（避免重複請求）
const quoteCache = new Map<
  string,
  { price: number; currency: string; timestamp: number }
>();
const CACHE_TTL = 60000; // 1 分鐘快取

// 現金輸入框上下鈕每次增減的金額
const CASH_STEP = 1000;

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
  // S&P 500 對照線開關，預設開啟（功能目的即為對比大盤）
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [totalGain, setTotalGain] = useState(0);
  // 已實現損益：賣出紀錄 realized_pnl_twd 加總；讀取失敗為 null，不冒充 0
  const [realizedPnl, setRealizedPnl] = useState<number | null>(null);
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
  const [sellTarget, setSellTarget] = useState<AggregatedHolding | null>(null);

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
  // 預設組合是否已解析：URL 已帶 portfolio_id 視為已解析；否則先載入 is_default 組合，
  // 避免在選定組合前就用 null 抓到「所有組合合併」的資料而閃動
  const [portfolioReady, setPortfolioReady] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('portfolio_id') !== null;
    }
    return false;
  });

  // 圖表刷新 key（變化時觸發圖表重新載入）
  const [chartRefreshKey, setChartRefreshKey] = useState<number>(0);

  // 用戶角色狀態
  const [userRole, setUserRole] = useState<"admin" | "guest" | "demo" | null>(null);
  const isAdmin = userRole === "admin";
  const isDemo = userRole === "demo";
  // demo 可自由編輯自己的沙盒；設定仍限 admin。
  const canEdit = isAdmin || isDemo;

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

  // 取得已實現損益（賣出紀錄加總）
  const loadRealizedPnl = useCallback(async (): Promise<number | null> => {
    try {
      const url = currentPortfolioId
        ? `/api/transactions?portfolio_id=${currentPortfolioId}`
        : "/api/transactions";
      const res = await fetch(url);
      const { data, error } = await res.json();
      if (error || !Array.isArray(data)) return null;
      return data
        .filter((t: { type?: string }) => t.type === "sell")
        .reduce((sum: number, t: { realized_pnl_twd?: number | null }) => sum + Number(t.realized_pnl_twd ?? 0), 0);
    } catch {
      return null;
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

    const [holdingsData, rate, cash, realized] = await Promise.all([
      loadHoldings(),
      fetchExchangeRate(),
      loadCashBalance(),
      loadRealizedPnl(),
    ]);

    setExchangeRate(rate);
    setCashBalance(cash);
    setRealizedPnl(realized);

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

    // 並行取得報價與 ETF 費用率
    const enrichedHoldings: HoldingWithQuote[] = await Promise.all(
      holdingsData.map(async (holding) => {
        const [quote, expenseRatio] = await Promise.all([
          fetchSingleQuote(holding.symbol),
          fetchExpenseRatio(holding.symbol),
        ]);

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

    // 計算總額（reduce 取代 async map 內的累加，避免在並行 callback 內 mutate 共用變數）
    const { totalCost, totalValue, etfWeightedSum } = enrichedHoldings.reduce(
      (acc, h) => {
        acc.totalCost += h.totalCostTWD || 0;
        acc.totalValue += h.currentValue || 0;
        if (h.expenseRatio != null && (h.currentValue || 0) > 0) {
          acc.etfWeightedSum += (h.currentValue || 0) * h.expenseRatio;
        }
        return acc;
      },
      { totalCost: 0, totalValue: 0, etfWeightedSum: 0 }
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
    loadRealizedPnl,
  ]);

  // 無 URL portfolio_id 時，先解析預設組合（is_default，否則第一個）再載入
  useEffect(() => {
    if (portfolioReady) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/portfolios');
        const { data } = await res.json();
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          const def =
            data.find((p: { is_default?: boolean }) => p.is_default) ?? data[0];
          setCurrentPortfolioId(def.id);
        }
      } catch (err) {
        console.error('解析預設組合失敗:', err);
      } finally {
        if (!cancelled) setPortfolioReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portfolioReady]);

  // 預設組合解析完成後才載入資料，避免載入全部合併資料的閃動
  useEffect(() => {
    if (!portfolioReady) return;
    refreshData();
  }, [refreshData, portfolioReady]);

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

  const stockValue = totalValueTWD - cashBalance;
  const stockPct = totalValueTWD > 0 ? (stockValue / totalValueTWD) * 100 : 0;
  const cashPct = totalValueTWD > 0 ? (cashBalance / totalValueTWD) * 100 : 0;

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
      {isDemo && (
        <div className="mb-4 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted">
          <span className="font-medium text-foreground">Demo 模式</span>
          ：這是你專屬的試玩沙盒，可自由新增與刪除，不影響任何真實資料；24 小時後自動重置。
        </div>
      )}

      {/* Header：右側依序為 新增持股、組合清單、設定、重新整理、登出；手機換行時整排靠右 */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-6">
        <div className="flex items-center gap-2">
          <Logo className="w-7 h-7 sm:w-8 sm:h-8 text-foreground" />
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold">
            Portfolio Visualizer
          </h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {canEdit && (
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary flex h-10 items-center justify-center gap-1.5 px-3! text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="新增持股"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>新增<span className="hidden sm:inline">持股</span></span>
            </button>
          )}
          <PortfolioSelector
            currentPortfolioId={currentPortfolioId}
            onSelectPortfolio={(portfolio) => {
              setCurrentPortfolioId(portfolio.id);
            }}
            readOnly={!canEdit}
          />
          <div className="flex items-center">
            {isAdmin && (
              <button
                onClick={() => router.push('/settings')}
                className="flex h-10 w-9 items-center justify-center rounded-lg transition-colors hover:bg-card sm:w-10"
                title="設定"
                aria-label="設定"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => {
                quoteCache.clear();
                refreshData();
              }}
              disabled={refreshing}
              className="flex h-10 w-9 items-center justify-center rounded-lg transition-colors hover:bg-card sm:w-10"
              title="重新整理"
              aria-label="重新整理"
            >
              <RefreshCw
                className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={handleLogout}
              className="flex h-10 w-9 items-center justify-center rounded-lg transition-colors hover:bg-card sm:w-10 text-muted hover:text-danger"
              title="登出"
              aria-label="登出"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* 上方：摘要卡、資產配置、股票總值走勢（xl 三欄；md 前兩者並排、走勢跨欄） */}
      <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]">
        {/* 左側：總資產（股票／現金）與總未實現損益 */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="card p-4! sm:p-6!">
            <div className="flex items-center gap-2 text-muted mb-1">
              <DollarSign className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm">總資產</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold tabular-nums">{formatCurrency(totalValueTWD)}</p>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
              <div className="bg-primary transition-[width] duration-500" style={{ width: `${stockPct}%` }} />
              <div className="bg-muted/70 transition-[width] duration-500" style={{ width: `${cashPct}%` }} />
            </div>
            <dl className="mt-3 divide-y divide-border">
              <div className="flex min-h-14 items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />股票
                </dt>
                <dd className="text-right tabular-nums">
                  <span className="font-semibold">{formatCurrency(stockValue)}</span>
                  <span className="ml-2 text-xs text-muted">{stockPct.toFixed(1)}%</span>
                </dd>
              </div>
              <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted/70" aria-hidden="true" />現金
                </dt>
                {isEditingCash ? (
                  <dd className="w-full">
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => { e.preventDefault(); void handleSaveCash(); }}
                      onKeyDown={(e) => { if (e.key === "Escape") handleCancelCash(); }}
                    >
                      <label className="relative min-w-0 flex-1">
                        <span className="sr-only">現金金額（新台幣）</span>
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">NT$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={cashInput}
                          onChange={(e) => setCashInput(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="no-spinner h-11 w-full pl-12! pr-10! text-right text-base tabular-nums"
                          placeholder="0"
                          autoFocus
                        />
                        <span className="absolute inset-y-1 right-1 flex w-8 flex-col overflow-hidden rounded-md border border-border">
                          {[
                            { step: CASH_STEP, label: "增加", Icon: ChevronUp },
                            { step: -CASH_STEP, label: "減少", Icon: ChevronDown },
                          ].map(({ step, label, Icon }) => (
                            <button
                              key={label}
                              type="button"
                              tabIndex={-1}
                              onClick={() => setCashInput((v) => String(Math.max(0, (parseFloat(v) || 0) + step)))}
                              className="flex flex-1 items-center justify-center text-muted transition-colors hover:bg-primary/15 hover:text-primary"
                              aria-label={`${label} ${CASH_STEP.toLocaleString("zh-TW")} 元`}
                            >
                              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          ))}
                        </span>
                      </label>
                      <button type="submit" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-up text-white hover:bg-up/80" aria-label="儲存現金">
                        <Check className="w-5 h-5" />
                      </button>
                      <button type="button" onClick={handleCancelCash} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-border hover:bg-border/70" aria-label="取消">
                        <X className="w-5 h-5" />
                      </button>
                    </form>
                  </dd>
                ) : (
                  <dd className="text-right tabular-nums">
                    {canEdit ? (
                      <button
                        onClick={handleEditCash}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label={`修改現金，目前 ${formatCurrency(cashBalance)}`}
                      >
                        <span className="font-semibold">{formatCurrency(cashBalance)}</span>
                        <span className="text-xs text-muted">{cashPct.toFixed(1)}%</span>
                        <Edit2 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                      </button>
                    ) : (
                      <>
                        <span className="font-semibold">{formatCurrency(cashBalance)}</span>
                        <span className="ml-2 text-xs text-muted">{cashPct.toFixed(1)}%</span>
                      </>
                    )}
                  </dd>
                )}
              </div>
            </dl>
          </div>

          <div className="card p-4! sm:p-6!">
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 text-muted mb-1">
                  <TrendingUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="text-sm">總未實現損益</span>
                </div>
                <p className={`text-xl sm:text-2xl font-bold tabular-nums ${totalGain >= 0 ? "text-up" : "text-down"}`}>
                  {totalGain >= 0 ? "+" : ""}
                  {formatCurrency(totalGain)}
                </p>
                <p className={`text-sm font-medium tabular-nums ${totalGain >= 0 ? "text-up" : "text-down"}`}>
                  {totalGainPercent >= 0 ? "+" : ""}
                  {totalGainPercent.toFixed(2)}%
                </p>
                <p className="mt-1 text-xs text-muted">現有持股，市值減成本</p>
              </div>
              <div className="min-w-0 pl-4">
                <div className="flex items-center gap-2 text-muted mb-1">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="text-sm">總已實現損益</span>
                </div>
                {realizedPnl === null ? (
                  <p className="text-xl sm:text-2xl font-bold text-muted">—</p>
                ) : (
                  <p className={`text-xl sm:text-2xl font-bold tabular-nums ${realizedPnl >= 0 ? "text-up" : "text-down"}`}>
                    {realizedPnl >= 0 ? "+" : ""}
                    {formatCurrency(realizedPnl)}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">已賣出部分的損益</p>
              </div>
            </div>
          </div>
        </div>

        {/* 資產配置 */}
        <div className="card p-4! sm:p-6!">
          <h2 className="text-lg font-semibold mb-3">資產配置</h2>
          {pieChartData.length > 0 && pieChartData.some((d) => d.value > 0) ? (
            <PortfolioPieChart holdings={aggregatedHoldings} cashBalance={cashBalance} />
          ) : (
            <div className="h-48 flex items-center justify-center text-muted">
              尚無資產資料
            </div>
          )}
        </div>

        {/* 股票總值走勢圖 */}
        <div className="card flex flex-col p-4! sm:p-6! md:col-span-2 xl:col-span-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">股票總值走勢</h2>
            <BenchmarkToggle on={showBenchmark} onToggle={() => setShowBenchmark((v) => !v)} />
          </div>
          <div className="h-[320px] xl:h-auto xl:min-h-[320px] xl:flex-1">
            <AssetTrendChart
              portfolioId={currentPortfolioId}
              refreshKey={chartRefreshKey}
              showBenchmark={showBenchmark}
            />
          </div>
        </div>
      </div>

      <AnalysisPanels
        portfolioId={currentPortfolioId}
        refreshKey={chartRefreshKey}
        onTransactionsChange={refreshData}
      />

      {/* 持股清單 */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">持股清單</h2>

        <HoldingList
          holdings={aggregatedHoldings}
          exchangeRate={exchangeRate}
          totalValue={totalValueTWD}
          onEdit={(h) => {
            setEditingHolding(h);
            setShowForm(true);
          }}
          onDelete={handleDeleteClick}
          onSell={canEdit ? (h) => setSellTarget(h) : undefined}
          readOnly={!canEdit}
          weightedExpenseRatio={weightedExpenseRatio}
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
