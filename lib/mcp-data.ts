import { scopeQuery, type Session } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { buildPortfolioContext } from '@/lib/portfolio-context';
import { addHolding, sellLots, setCash, TradeError, updateHolding } from '@/lib/trades';
import { ToolInputError, type AnalyticsKind, type PortfolioStore } from '@/lib/mcp-server';
import { getMetrics } from '@/lib/analytics/metrics';
import { getAssetTrend } from '@/lib/analytics/asset-trend';
import { getDailyPnl } from '@/lib/analytics/daily-pnl';
import { getDividends } from '@/lib/analytics/dividends';
import { getLookthrough } from '@/lib/analytics/lookthrough';
import { getEtfExpense } from '@/lib/analytics/etf-expense';

// 專用金鑰只授權管理員的真實資料，不能藉參數切換角色或沙盒。
const MCP_SESSION: Session = { role: 'admin', demoSpace: null, guestId: null };

async function assertPortfolio(portfolioId: string): Promise<void> {
  const { data, error } = await scopeQuery(
    createServerClient().from('portfolios').select('id').eq('id', portfolioId), MCP_SESSION,
  ).maybeSingle();
  if (error) throw new Error('讀取投資組合失敗');
  if (!data) throw new ToolInputError('找不到投資組合，請用 portfolio_list 取得正確 id。');
}

// 使用者可修正的錯誤（股數不足、組合不存在）原文回給 AI；伺服器錯誤不外洩細節。
async function trade<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TradeError && error.status < 500) throw new ToolInputError(error.message);
    throw error;
  }
}

const num = (v: unknown) => Number(v ?? 0);

// 與網站共用同一份計算：以內部 Request 呼叫 lib/analytics，回應格式與網站 API 相同
type AnalyticsFn = (request: Request, session: Session) => Promise<Response>;
const ANALYTICS: Record<AnalyticsKind, AnalyticsFn> = {
  performance: getMetrics,
  asset_trend: getAssetTrend,
  daily_pnl: getDailyPnl,
  dividends: getDividends,
  lookthrough: getLookthrough,
};

async function readApi(response: Response): Promise<unknown> {
  const body = await response.json() as { data?: unknown; error?: string };
  if (response.ok && !body.error) return body.data ?? null;
  if (response.status < 500 && body.error) throw new ToolInputError(body.error);
  throw new Error(body.error ?? `分析計算失敗 (${response.status})`);
}

async function expenseRatio(symbol: string): Promise<number | null> {
  try {
    const data = await readApi(await getEtfExpense(new Request(`http://mcp.internal/api/etf/expense?symbol=${encodeURIComponent(symbol)}`))) as { expense_ratio?: number | null } | null;
    return typeof data?.expense_ratio === 'number' ? data.expense_ratio : null;
  } catch {
    return null; // 同網站：查不到費用率視為非 ETF，不影響其他欄位
  }
}

export const portfolioReader: PortfolioStore = {
  async list() {
    const { data, error } = await scopeQuery(
      createServerClient().from('portfolios').select('id, name, is_default'), MCP_SESSION,
    ).order('created_at', { ascending: true });
    if (error) throw new Error('讀取投資組合清單失敗');
    return data ?? [];
  },
  async snapshot(portfolioId) {
    if (portfolioId) await assertPortfolio(portfolioId);
    const context = await buildPortfolioContext(portfolioId ?? null, null, MCP_SESSION);
    const missingQuotes = context.holdings.filter((h) => h.price === null).map((h) => h.symbol);
    const ratios = await Promise.all(context.holdings.map((h) => expenseRatio(h.symbol)));
    const holdings = context.holdings.map((h, i) => ({ ...h, expenseRatio: ratios[i] }));
    // 同網站：ETF 市值 × 費用率加總 ÷ 全部股票市值
    const etfWeightedSum = holdings.reduce((sum, h) => sum + (h.expenseRatio !== null && h.valueTwd > 0 ? h.valueTwd * h.expenseRatio : 0), 0);
    return {
      ...context,
      holdings,
      weightedExpenseRatio: context.totalValueTwd > 0 && etfWeightedSum > 0 ? etfWeightedSum / context.totalValueTwd : null,
      asOf: new Date().toISOString(),
      currency: 'TWD',
      valuationComplete: missingQuotes.length === 0 && !context.exchangeRateEstimated,
      warnings: [
        ...(missingQuotes.length ? [`以下標的缺報價，市值暫記 0，總額及比例不完整：${missingQuotes.join(', ')}`] : []),
        ...(context.exchangeRateEstimated ? ['匯率無法取得，暫用 1 USD = 32 TWD；金額為估算。'] : []),
      ],
    };
  },
  async trades(portfolioId) {
    if (portfolioId) await assertPortfolio(portfolioId);
    const supabase = createServerClient();
    let lotsQuery = scopeQuery(
      supabase.from('holdings').select('id, portfolio_id, symbol, market, shares, cost_price, purchase_date'), MCP_SESSION,
    ).order('purchase_date', { ascending: true });
    let sellsQuery = scopeQuery(
      supabase.from('transactions')
        .select('id, portfolio_id, holding_id, symbol, market, shares, price, transaction_date, realized_pnl_twd, notes')
        .eq('type', 'sell'), MCP_SESSION,
    ).order('transaction_date', { ascending: true });
    if (portfolioId) {
      lotsQuery = lotsQuery.eq('portfolio_id', portfolioId);
      sellsQuery = sellsQuery.eq('portfolio_id', portfolioId);
    }
    const [lotsRes, sellsRes] = await Promise.all([lotsQuery, sellsQuery]);
    if (lotsRes.error || sellsRes.error) throw new Error('讀取買賣紀錄失敗');
    const sells = sellsRes.data ?? [];

    const soldByLot = new Map<string, number>();
    const bySymbol = new Map<string, { symbol: string; market: string; sharesSold: number; realizedPnlTwd: number }>();
    for (const s of sells) {
      if (s.holding_id) soldByLot.set(s.holding_id, (soldByLot.get(s.holding_id) ?? 0) + num(s.shares));
      const agg = bySymbol.get(s.symbol) ?? { symbol: s.symbol, market: s.market, sharesSold: 0, realizedPnlTwd: 0 };
      bySymbol.set(s.symbol, { ...agg, sharesSold: agg.sharesSold + num(s.shares), realizedPnlTwd: agg.realizedPnlTwd + num(s.realized_pnl_twd) });
    }

    const buys = (lotsRes.data ?? []).map((l) => ({
      lotId: l.id, portfolioId: l.portfolio_id, symbol: l.symbol, market: l.market,
      purchaseDate: l.purchase_date, costPrice: num(l.cost_price),
      sharesBought: num(l.shares) + (soldByLot.get(l.id) ?? 0), sharesRemaining: num(l.shares),
    }));
    const heldSymbols = new Set(buys.filter((b) => b.sharesRemaining > 0).map((b) => b.symbol));
    const realizedBySymbol = [...bySymbol.values()].map((r) => ({
      ...r, realizedPnlTwd: Math.round(r.realizedPnlTwd), stillHeld: heldSymbols.has(r.symbol),
    }));
    return {
      buys,
      sells: sells.map((s) => ({
        id: s.id, portfolioId: s.portfolio_id, lotId: s.holding_id, symbol: s.symbol, market: s.market,
        transactionDate: s.transaction_date, shares: num(s.shares), price: num(s.price),
        realizedPnlTwd: s.realized_pnl_twd === null ? null : num(s.realized_pnl_twd), notes: s.notes,
      })),
      realizedBySymbol,
      // 先加總原值再四捨五入，與網站「總已實現損益」一致
      totalRealizedPnlTwd: Math.round(sells.reduce((sum, r) => sum + num(r.realized_pnl_twd), 0)),
      note: 'costPrice 與 price 為標的原幣；已實現損益為 TWD（美股成本用買入日匯率、賣價用賣出日匯率）。',
    };
  },
  async analytics(kind, { portfolio_id, days, start, end }) {
    if (portfolio_id) await assertPortfolio(portfolio_id);
    const query = new URLSearchParams();
    if (portfolio_id) query.set('portfolio_id', portfolio_id);
    if (kind === 'daily_pnl') {
      if (start && end) { query.set('start', start); query.set('end', end); }
      else query.set('days', String(days ?? 30));
    }
    const data = await readApi(await ANALYTICS[kind](new Request(`http://mcp.internal/api/${kind}?${query}`), MCP_SESSION));
    if (kind === 'performance' && data && typeof data === 'object') {
      // 每日回撤序列很長，改給投組與 S&P 500 的最深回撤摘要
      const { underwater, ...rest } = data as { underwater?: { benchmark?: number | null }[] };
      const benchmarkTrough = underwater?.some((p) => typeof p.benchmark === 'number')
        ? underwater.reduce((min, p) => Math.min(min, p.benchmark ?? 0), 0)
        : null;
      return { portfolioId: portfolio_id ?? null, data: { ...rest, benchmarkTrough } };
    }
    return { portfolioId: portfolio_id ?? null, data };
  },
  async updateHolding({ lot_id, ...changes }) {
    const { data: lot, error } = await scopeQuery(
      createServerClient().from('holdings').select('id, portfolio_id, symbol, shares, cost_price, purchase_date')
        .eq('id', lot_id).gt('shares', 0), MCP_SESSION,
    ).maybeSingle();
    if (error) throw new Error('讀取持股失敗');
    if (!lot) throw new ToolInputError('找不到此批次（或已全部賣出），請用 portfolio_trades 取得仍有剩餘股數的 lotId。');
    const before = { symbol: lot.symbol, shares: num(lot.shares), costPrice: num(lot.cost_price), purchaseDate: lot.purchase_date };
    const row = await trade(() => updateHolding(MCP_SESSION, lot_id, {
      symbol: changes.symbol ?? lot.symbol,
      shares: changes.shares ?? num(lot.shares),
      cost_price: changes.cost_price ?? num(lot.cost_price),
      purchase_date: changes.purchase_date ?? lot.purchase_date,
    }));
    return {
      lotId: row.id, portfolioId: row.portfolio_id, before,
      after: { symbol: row.symbol, shares: num(row.shares), costPrice: num(row.cost_price), purchaseDate: row.purchase_date },
    };
  },
  async setCash({ portfolio_id, amount_twd }) {
    await assertPortfolio(portfolio_id);
    const { data: current } = await scopeQuery(
      createServerClient().from('cash_balance').select('amount_twd').eq('portfolio_id', portfolio_id), MCP_SESSION,
    ).maybeSingle();
    const row = await trade(() => setCash(MCP_SESSION, { amount_twd, portfolio_id }));
    return { portfolioId: portfolio_id, previousTwd: num(current?.amount_twd), amountTwd: num(row.amount_twd) };
  },
  async addHolding(args) {
    await assertPortfolio(args.portfolio_id);
    const row = await trade(() => addHolding(MCP_SESSION, args));
    return {
      lotId: row.id, portfolioId: row.portfolio_id, symbol: row.symbol, market: row.market,
      shares: num(row.shares), costPrice: num(row.cost_price), purchaseDate: row.purchase_date,
      note: '已新增買入批次；未扣除現金。',
    };
  },
  async sell({ portfolio_id, symbol, shares, price, transaction_date, notes }) {
    await assertPortfolio(portfolio_id);
    const { data, error } = await scopeQuery(
      createServerClient().from('holdings').select('id')
        .eq('portfolio_id', portfolio_id).eq('symbol', symbol.toUpperCase()).gt('shares', 0), MCP_SESSION,
    );
    if (error) throw new Error('讀取持股失敗');
    if (!data?.length) throw new ToolInputError(`此組合沒有持有 ${symbol.toUpperCase()}。`);
    const result = await trade(() => sellLots(MCP_SESSION, {
      lot_ids: data.map((l) => l.id), shares, price, transaction_date, notes, portfolio_id,
    }));
    return { symbol: symbol.toUpperCase(), portfolioId: portfolio_id, ...result };
  },
};
