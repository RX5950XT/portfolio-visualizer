import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  getSession,
  getVisiblePortfolioIdsForRole,
  requireWriteSession,
  scopeQuery,
  stampSpace,
} from '@/lib/auth';
import { fetchExchangeRate } from '@/lib/stocks';
import { fetchFxHistory, buildDenseRateMap } from '@/lib/portfolio-history';

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

// GET: 取得交易歷史
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    const visibleIds = await getVisiblePortfolioIdsForRole(session);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();

    let query = scopeQuery(supabase.from('transactions').select('*'), session)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    } else if (visibleIds !== null) {
      if (visibleIds.length === 0) {
        return NextResponse.json({ data: [] });
      }
      query = query.in('portfolio_id', visibleIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error('取得交易紀錄失敗:', error);
      return NextResponse.json({ error: '取得交易紀錄失敗' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// POST: 賣出股票（以標的整體為單位）
//
// 賣出視為一體：聚合該標的所有批次 → 用整體加權均價計損益 → 各批次依比例扣減。
// pro-rata 下「各批次用自身成本算損益再加總」恆等於「整體均價損益」，
// 且每個被扣批次各寫一筆 sell tx（holding_id 對應 lot），歷史圖表重建邏輯無須改動。
export async function POST(request: Request) {
  try {
    const auth = await requireWriteSession();
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const body = await request.json();
    const { lot_ids, shares: sellShares, price: sellPrice, transaction_date, notes } = body;

    if (!Array.isArray(lot_ids) || lot_ids.length === 0 || !sellShares || !sellPrice || !transaction_date) {
      return NextResponse.json({ error: '請填寫所有必填欄位' }, { status: 400 });
    }

    const sellSharesNum = parseFloat(sellShares);
    const sellPriceNum = parseFloat(sellPrice);

    if (!(sellSharesNum > 0)) {
      return NextResponse.json({ error: '賣出股數必須大於 0' }, { status: 400 });
    }
    if (!(sellPriceNum > 0)) {
      return NextResponse.json({ error: '成交價必須大於 0' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 跨沙盒的 lot_ids 會匹配 0 筆 → 下方 lots.length === 0 → 404
    const { data: lotsData, error: lotsError } = await scopeQuery(
      supabase.from('holdings').select('*').in('id', lot_ids).gt('shares', 0),
      session
    );

    if (lotsError) {
      console.error('取得持股失敗:', lotsError);
      return NextResponse.json({ error: '取得持股失敗' }, { status: 500 });
    }

    const lots = (lotsData ?? []) as LotRow[];
    if (lots.length === 0) {
      return NextResponse.json({ error: '找不到該持股' }, { status: 404 });
    }

    // 整體賣出前提：所有批次須為同一標的（同 symbol、同 market）
    const { symbol, market } = lots[0];
    if (lots.some((l) => l.symbol !== symbol || l.market !== market)) {
      return NextResponse.json({ error: '批次資料不一致' }, { status: 400 });
    }

    const totalShares = lots.reduce((sum, l) => sum + Number(l.shares), 0);
    const totalCost = lots.reduce((sum, l) => sum + Number(l.shares) * Number(l.cost_price), 0);
    const avgCost = totalCost / totalShares;

    const EPS = 1e-8;
    if (sellSharesNum > totalShares + EPS) {
      return NextResponse.json(
        { error: `賣出股數 (${sellSharesNum}) 超過持有量 (${totalShares})` },
        { status: 400 }
      );
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
      : body.portfolio_id || lots[0].portfolio_id || null;
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
      return NextResponse.json({ error: '寫入交易紀錄失敗' }, { status: 500 });
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
        return NextResponse.json({ error: '更新持股失敗' }, { status: 500 });
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
    return NextResponse.json({
      data: {
        success: true,
        realized_pnl_twd: Math.round(totalRealizedPnl * 100) / 100,
        remaining_shares: Math.max(0, totalShares - sellSharesNum),
        cash_added_twd: Math.round(sellAmountTWD),
        avg_cost: avgCost,
      },
    });
  } catch (err) {
    console.error('賣出操作失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
