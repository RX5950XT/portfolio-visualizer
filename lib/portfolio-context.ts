import { createServerClient } from '@/lib/supabase';
import { fetchMultipleQuotes, fetchExchangeRate } from '@/lib/stocks';

interface HoldingRow {
  symbol: string;
  shares: number;
  cost_price: number;
  market: 'US' | 'TW';
}

export interface ContextHolding {
  symbol: string;
  market: 'US' | 'TW';
  shares: number;
  price: number | null;
  valueTwd: number;
  costTwd: number;
  gainPercent: number | null;
  weight: number; // 佔總資產（含現金）比例
}

export interface PortfolioContext {
  holdings: ContextHolding[];
  totalValueTwd: number; // 股票市值
  totalCostTwd: number;
  cashTwd: number;
  totalAssetsTwd: number; // 股票 + 現金
  totalGainTwd: number;
  totalGainPercent: number;
  exchangeRate: number;
}

// 組裝投資組合快照（同標的多批次合併），供 AI 顧問或洞察頁使用
export async function buildPortfolioContext(
  portfolioId: string | null,
  visibleIds: string[] | null
): Promise<PortfolioContext> {
  const supabase = createServerClient();

  let query = supabase.from('holdings').select('symbol, shares, cost_price, market').gt('shares', 0);
  if (portfolioId) {
    query = query.eq('portfolio_id', portfolioId);
  } else if (visibleIds !== null) {
    if (visibleIds.length === 0) {
      return emptyContext();
    }
    query = query.in('portfolio_id', visibleIds);
  }

  let cashQuery = supabase.from('cash_balance').select('amount_twd, portfolio_id');
  if (portfolioId) {
    cashQuery = cashQuery.eq('portfolio_id', portfolioId);
  } else if (visibleIds !== null) {
    cashQuery = cashQuery.in('portfolio_id', visibleIds);
  }

  const [{ data: holdings }, { data: cashRows }, exchangeRate] = await Promise.all([
    query,
    cashQuery,
    fetchExchangeRate().then((r) => r ?? 32),
  ]);

  const cashTwd = (cashRows ?? []).reduce(
    (sum: number, c: { amount_twd: number }) => sum + Number(c.amount_twd || 0),
    0
  );

  if (!holdings || holdings.length === 0) {
    return { ...emptyContext(), cashTwd, totalAssetsTwd: cashTwd, exchangeRate };
  }

  // 同標的多批次合併
  const bySymbol = new Map<string, { symbol: string; market: 'US' | 'TW'; shares: number; costOrig: number }>();
  for (const lot of holdings as HoldingRow[]) {
    const agg = bySymbol.get(lot.symbol) ?? {
      symbol: lot.symbol,
      market: lot.market,
      shares: 0,
      costOrig: 0,
    };
    agg.shares += Number(lot.shares);
    agg.costOrig += Number(lot.shares) * Number(lot.cost_price);
    bySymbol.set(lot.symbol, agg);
  }

  const symbols = [...bySymbol.keys()];
  const quotes = await fetchMultipleQuotes(symbols);

  let totalValueTwd = 0;
  let totalCostTwd = 0;
  const rows: Omit<ContextHolding, 'weight'>[] = [];

  for (const agg of bySymbol.values()) {
    const isUS = agg.market === 'US';
    const fx = isUS ? exchangeRate : 1;
    const price = quotes.get(agg.symbol)?.regularMarketPrice ?? null;
    const valueTwd = price ? agg.shares * price * fx : 0;
    const costTwd = agg.costOrig * fx;
    totalValueTwd += valueTwd;
    totalCostTwd += costTwd;
    rows.push({
      symbol: agg.symbol,
      market: agg.market,
      shares: agg.shares,
      price,
      valueTwd: Math.round(valueTwd),
      costTwd: Math.round(costTwd),
      gainPercent: costTwd > 0 && price ? (valueTwd / costTwd - 1) * 100 : null,
    });
  }

  const totalAssetsTwd = totalValueTwd + cashTwd;
  const holdingsWithWeight: ContextHolding[] = rows
    .map((r) => ({
      ...r,
      weight: totalAssetsTwd > 0 ? (r.valueTwd / totalAssetsTwd) * 100 : 0,
    }))
    .sort((a, b) => b.valueTwd - a.valueTwd);

  const totalGainTwd = totalValueTwd - totalCostTwd;

  return {
    holdings: holdingsWithWeight,
    totalValueTwd: Math.round(totalValueTwd),
    totalCostTwd: Math.round(totalCostTwd),
    cashTwd: Math.round(cashTwd),
    totalAssetsTwd: Math.round(totalAssetsTwd),
    totalGainTwd: Math.round(totalGainTwd),
    totalGainPercent: totalCostTwd > 0 ? (totalGainTwd / totalCostTwd) * 100 : 0,
    exchangeRate,
  };
}

function emptyContext(): PortfolioContext {
  return {
    holdings: [],
    totalValueTwd: 0,
    totalCostTwd: 0,
    cashTwd: 0,
    totalAssetsTwd: 0,
    totalGainTwd: 0,
    totalGainPercent: 0,
    exchangeRate: 32,
  };
}
