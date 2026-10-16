import { createServerClient } from '@/lib/supabase';
import { scopeQuery, stampSpace, type Session } from '@/lib/auth';
import { fetchExchangeRate } from '@/lib/stocks';
import { fetchFxHistory, buildDenseRateMap } from '@/lib/portfolio-history';

// 網站 API 與 MCP 共用的新增／賣出流程；status < 500 的訊息可直接回給使用者。
export class TradeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface NewHoldingInput {
  symbol?: string;
  shares?: number | string;
  cost_price?: number | string;
  purchase_date?: string;
  portfolio_id?: string | null;
}

export async function addHolding(session: Session, input: NewHoldingInput) {
  const { symbol, shares, cost_price, purchase_date, portfolio_id } = input;

  // 驗證必填欄位
  if (!symbol || !shares || !cost_price || !purchase_date) {
    throw new TradeError('請填寫所有必填欄位', 400);
  }

  // 判斷市場（台股或美股）
  const upperSymbol = symbol.toUpperCase();
  const market = upperSymbol.includes('.TW') ? 'TW' : 'US';

  const supabase = createServerClient();

  const insertData: {
    symbol: string;
    shares: number;
    cost_price: number;
    purchase_date: string;
    market: string;
    portfolio_id?: string;
    demo_space?: string;
  } = {
    symbol: upperSymbol,
    shares: parseFloat(String(shares)),
    cost_price: parseFloat(String(cost_price)),
    purchase_date,
    market,
    ...stampSpace(session),
  };

  // 有指定組合時，驗證該組合屬於當前 session 的範圍：
  // demo 帶真實組合 id、或任意非法/他人 id 都會匹配 0 筆而被擋，避免跨 space 參照污染
  if (portfolio_id) {
    const { data: owned } = await scopeQuery(
      supabase.from('portfolios').select('id').eq('id', portfolio_id),
      session
    ).maybeSingle();
    if (!owned) {
      throw new TradeError('無效的投資組合', 400);
    }
    insertData.portfolio_id = portfolio_id;
  }

  const { data, error } = await supabase
    .from('holdings')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('新增持股失敗:', error);
    throw new TradeError('新增持股失敗', 500);
  }
  return data;
}

// 賣出時用 UI 傳來的批次 id 直接定位，避免跨 portfolio/symbol 的查詢歧義
interface LotRow {
  id: string;
  symbol: string;
  market: 'US' | 'TW';
  shares: number;
  cost_price: number;
  purchase_date: string;
  portfolio_id: string | null;
}

interface SellTxRow {
  symbol: string;
  type: 'sell';
  shares: number;
  price: number;
  transaction_date: string;
  market: 'US' | 'TW';
  realized_pnl_twd: number;
  holding_id: string;
  portfolio_id: string | null;
  notes: string | null;
  demo_space?: string;
}

export interface SellInput {
  lot_ids?: unknown;
  shares?: number | string;
  price?: number | string;
  transaction_date?: string;
  notes?: string | null;
  portfolio_id?: string | null;
}

// 賣出股票（以標的整體為單位）
//
// 賣出視為一體：聚合該標的所有批次 → 用整體加權均價計損益 → 各批次依比例扣減。
// pro-rata 下「各批次用自身成本算損益再加總」恆等於「整體均價損益」，
// 且每個被扣批次各寫一筆 sell tx（holding_id 對應 lot），歷史圖表重建邏輯無須改動。
export async function sellLots(session: Session, input: SellInput) {
  const { lot_ids, shares: sellShares, price: sellPrice, transaction_date, notes } = input;

  if (!Array.isArray(lot_ids) || lot_ids.length === 0 || !sellShares || !sellPrice || !transaction_date) {
    throw new TradeError('請填寫所有必填欄位', 400);
  }

  const sellSharesNum = parseFloat(String(sellShares));
  const sellPriceNum = parseFloat(String(sellPrice));

  if (!(sellSharesNum > 0)) {
    throw new TradeError('賣出股數必須大於 0', 400);
  }
  if (!(sellPriceNum > 0)) {
    throw new TradeError('成交價必須大於 0', 400);
  }

  const supabase = createServerClient();

  // 跨沙盒的 lot_ids 會匹配 0 筆 → 下方 lots.length === 0 → 404
  const { data: lotsData, error: lotsError } = await scopeQuery(
    supabase.from('holdings').select('*').in('id', lot_ids).gt('shares', 0),
    session
  );

  if (lotsError) {
    console.error('取得持股失敗:', lotsError);
    throw new TradeError('取得持股失敗', 500);
  }

  const lots = (lotsData ?? []) as LotRow[];
  if (lots.length === 0) {
    throw new TradeError('找不到該持股', 404);
  }

  // 整體賣出前提：所有批次須為同一標的（同 symbol、同 market）
  const { symbol, market } = lots[0];
  if (lots.some((l) => l.symbol !== symbol || l.market !== market)) {
    throw new TradeError('批次資料不一致', 400);
  }

  const totalShares = lots.reduce((sum, l) => sum + Number(l.shares), 0);
  const totalCost = lots.reduce((sum, l) => sum + Number(l.shares) * Number(l.cost_price), 0);
  const avgCost = totalCost / totalShares;

  const EPS = 1e-8;
  if (sellSharesNum > totalShares + EPS) {
    throw new TradeError(`賣出股數 (${sellSharesNum}) 超過持有量 (${totalShares})`, 400);
  }

  const isUS = market === 'US';

  // 美股已實現損益需要分開換算：成本套買入當日 FX、賣價套賣出當日 FX，
  // 否則用同一個匯率會把整段持有期間的匯率變動吃掉，少算 FX 損益。
  let sellDayFx = 1;
  let getFxAtPurchase: (date: string) => number = () => 1;
  if (isUS) {
    const earliestPurchase = lots.reduce(
      (min, l) => (l.purchase_date < min ? l.purchase_date : min),
      lots[0].purchase_date
    );
    const fxStart =
      earliestPurchase < transaction_date ? earliestPurchase : transaction_date;
    const fxSparse = await fetchFxHistory(fxStart);

    const dateList: string[] = [];
    const endDateObj = new Date(transaction_date);
    for (let d = new Date(fxStart); d <= endDateObj; d.setDate(d.getDate() + 1)) {
      dateList.push(d.toISOString().split('T')[0]);
    }
    const dense = buildDenseRateMap(fxSparse, dateList);

    // 賣出當日 FX：若 Yahoo 尚未更新當日匯率，dense 會 forward-fill；再 fallback 即時匯率
    sellDayFx = dense.get(transaction_date) ?? (await fetchExchangeRate()) ?? 32;
    getFxAtPurchase = (date: string) => dense.get(date) ?? sellDayFx;
  }
  // demo 忽略 body.portfolio_id：避免把任意（甚至真實）組合 id 寫進自己沙盒的 tx row
  const portfolioId = session.demoSpace
    ? lots[0].portfolio_id
    : input.portfolio_id || lots[0].portfolio_id || null;
  const ratio = sellSharesNum / totalShares;

  // pro-rata 累積分配：用「應累積賣出 − 已實際扣減」算每批次扣減量，
  // 確保各批次扣減總和精確等於賣出股數，不受浮點誤差影響。
  const txRows: SellTxRow[] = [];
  const lotUpdates: { id: string; shares: number }[] = [];

  let cumSharesSeen = 0;
  let cumDeducted = 0;
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    const lotShares = Number(lot.shares);
    cumSharesSeen += lotShares;

    const targetCum = i === lots.length - 1 ? sellSharesNum : cumSharesSeen * ratio;
    let deduct = targetCum - cumDeducted;
    if (deduct < 0) deduct = 0;
    if (deduct > lotShares) deduct = lotShares;
    cumDeducted += deduct;

    if (deduct <= EPS) continue;

    const remaining = lotShares - deduct;
    const purchaseFx = getFxAtPurchase(lot.purchase_date);
    const proceedsTwd = sellPriceNum * deduct * sellDayFx;
    const costTwd = Number(lot.cost_price) * deduct * purchaseFx;
    const realizedPnl = proceedsTwd - costTwd;

    txRows.push({
      symbol,
      type: 'sell',
      shares: deduct,
      price: sellPriceNum,
      transaction_date,
      market,
      realized_pnl_twd: Math.round(realizedPnl * 100) / 100,
      holding_id: lot.id,
      portfolio_id: portfolioId,
      notes: notes || null,
      ...stampSpace(session),
    });
    lotUpdates.push({ id: lot.id, shares: remaining <= EPS ? 0 : remaining });
  }

  // 寫入交易紀錄（各被扣批次各一筆，holding_id 對應 lot 供歷史重建）
  const { error: txError } = await supabase.from('transactions').insert(txRows);
  if (txError) {
    console.error('寫入交易紀錄失敗:', txError);
    throw new TradeError('寫入交易紀錄失敗', 500);
  }

  // 更新各批次股數（全扣 → shares=0 軟刪除，保留 row 供歷史圖表重建）
  const now = new Date().toISOString();
  for (const u of lotUpdates) {
    const { error: updateError } = await scopeQuery(
      supabase.from('holdings').update({ shares: u.shares, updated_at: now }).eq('id', u.id),
      session
    );
    if (updateError) {
      console.error('更新持股失敗:', updateError);
      throw new TradeError('更新持股失敗', 500);
    }
  }

  // 更新現金餘額（加回整體賣出金額）：用賣出當日 FX，與 realizedPnl 換算口徑一致
  const sellAmountTWD = sellPriceNum * sellSharesNum * sellDayFx;
  let cashQuery = scopeQuery(supabase.from('cash_balance').select('*'), session);
  if (portfolioId) {
    cashQuery = cashQuery.eq('portfolio_id', portfolioId);
  }
  const { data: cashData } = await cashQuery.single();

  if (cashData) {
    await scopeQuery(
      supabase
        .from('cash_balance')
        .update({ amount_twd: Number(cashData.amount_twd) + sellAmountTWD, updated_at: now })
        .eq('id', cashData.id),
      session
    );
  } else {
    const insertData: { amount_twd: number; portfolio_id?: string; demo_space?: string } = {
      amount_twd: sellAmountTWD,
      ...stampSpace(session),
    };
    if (portfolioId) insertData.portfolio_id = portfolioId;
    await supabase.from('cash_balance').insert(insertData);
  }

  const totalRealizedPnl = txRows.reduce((sum, t) => sum + (t.realized_pnl_twd || 0), 0);
  return {
    success: true,
    realized_pnl_twd: Math.round(totalRealizedPnl * 100) / 100,
    remaining_shares: Math.max(0, totalShares - sellSharesNum),
    cash_added_twd: Math.round(sellAmountTWD),
    avg_cost: avgCost,
  };
}

export interface HoldingUpdateInput {
  symbol?: string;
  shares?: number | string;
  cost_price?: number | string;
  purchase_date?: string;
}

// 編輯單一批次（與網站「編輯持股」相同：整筆覆寫代號、股數、成本價、買入日）
export async function updateHolding(session: Session, id: string, input: HoldingUpdateInput) {
  const { symbol, shares, cost_price, purchase_date } = input;

  const upperSymbol = symbol?.toUpperCase();
  const market = upperSymbol?.includes('.TW') ? 'TW' : 'US';

  const supabase = createServerClient();

  const { data, error } = await scopeQuery(
    supabase
      .from('holdings')
      .update({
        symbol: upperSymbol,
        shares: parseFloat(String(shares)),
        cost_price: parseFloat(String(cost_price)),
        purchase_date,
        market,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id),
    session
  )
    .select()
    .single();

  if (error) {
    console.error('更新持股失敗:', error);
    throw new TradeError('更新持股失敗', 500);
  }
  return data;
}

export interface CashInput {
  amount_twd?: unknown;
  portfolio_id?: string | null;
}

// 設定組合現金餘額（與網站「修改現金」相同：直接覆寫為新金額）
export async function setCash(session: Session, input: CashInput) {
  const { amount_twd, portfolio_id } = input;

  if (typeof amount_twd !== 'number' || isNaN(amount_twd)) {
    throw new TradeError('金額格式錯誤', 400);
  }

  const supabase = createServerClient();

  // 有指定組合時，驗證歸屬（demo 帶真實/他人組合 id 會匹配 0 筆而被擋，避免跨 space 參照污染）
  if (portfolio_id) {
    const { data: owned } = await scopeQuery(
      supabase.from('portfolios').select('id').eq('id', portfolio_id),
      session
    ).maybeSingle();
    if (!owned) {
      throw new TradeError('無效的投資組合', 400);
    }
  }

  // 先嘗試查詢現有記錄
  let query = scopeQuery(supabase.from('cash_balance').select('id'), session);
  if (portfolio_id) {
    query = query.eq('portfolio_id', portfolio_id);
  }
  const { data: existingData, error: selectError } = await query.single();
  if (selectError && selectError.code !== 'PGRST116') {
    console.error('查詢現金餘額失敗:', selectError);
  }

  let result;
  if (existingData) {
    // 更新現有記錄
    result = await scopeQuery(
      supabase
        .from('cash_balance')
        .update({
          amount_twd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingData.id),
      session
    )
      .select()
      .single();
  } else {
    // 新增記錄
    const insertData: { amount_twd: number; portfolio_id?: string; demo_space?: string } = {
      amount_twd,
      ...stampSpace(session),
    };
    if (portfolio_id) {
      insertData.portfolio_id = portfolio_id;
    }
    result = await supabase
      .from('cash_balance')
      .insert(insertData)
      .select()
      .single();
  }

  if (result.error) {
    console.error('更新現金餘額失敗:', result.error);
    throw new TradeError('更新現金餘額失敗', 500);
  }
  return result.data;
}
