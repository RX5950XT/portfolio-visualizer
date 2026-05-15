import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserRole, getVisiblePortfolioIdsForRole } from '@/lib/auth';
import { fetchHistory } from '@/lib/stocks';
import { fetchFxHistory, buildDenseRateMap, makeSharesResolver } from '@/lib/portfolio-history';

interface Holding {
  id: string;
  symbol: string;
  shares: number;
  cost_price: number;
  purchase_date: string;
  market: 'US' | 'TW';
}

interface DailyPnLPoint {
  date: string;
  pnl: number;
}

// GET: 取得每日損益資料
export async function GET(request: Request) {
  try {
    const role = await getUserRole();
    if (!role) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7', 10);
    const portfolioId = searchParams.get('portfolio_id');

    const visibleIds = await getVisiblePortfolioIdsForRole(role);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();

    // 不加 shares>0 過濾，需要含軟刪除的 lot 來重建歷史持股量
    let query = supabase.from('holdings').select('*');
    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    } else if (visibleIds !== null) {
      if (visibleIds.length === 0) return NextResponse.json({ data: [] });
      query = query.in('portfolio_id', visibleIds);
    }

    const { data: holdings, error } = await query;
    if (error) {
      console.error('取得持股失敗:', error);
      return NextResponse.json({ error: '取得持股失敗' }, { status: 500 });
    }
    if (!holdings || holdings.length === 0) return NextResponse.json({ data: [] });

    const endDate = new Date();
    const startDate = new Date();
    // 多抓 2.5 倍日曆天，確保涵蓋足夠交易日
    startDate.setDate(startDate.getDate() - Math.ceil(days * 2.5));
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const holdingIds = holdings.map((h: Holding) => h.id);

    // 並行取得：各標的歷史股價 + 歷史匯率 + 賣出交易
    const [historyResults, fxSparse, sellsResult] = await Promise.all([
      Promise.all(
        holdings.map(async (h: Holding) => {
          const history = await fetchHistory(h.symbol, { startDate: startDateStr, endDate: endDateStr });
          const priceMap = new Map<string, number>();
          history.forEach((p) => priceMap.set(p.date, p.close));
          return { symbol: h.symbol, priceMap };
        })
      ),
      fetchFxHistory(startDateStr),
      supabase
        .from('transactions')
        .select('holding_id, shares, transaction_date')
        .in('holding_id', holdingIds)
        .eq('type', 'sell'),
    ]);

    // 合併同 symbol 的 priceMap（同標的多個 lot 共用同一份歷史）
    const symbolPriceMap = new Map<string, Map<string, number>>();
    for (const { symbol, priceMap } of historyResults) {
      if (!symbolPriceMap.has(symbol)) {
        symbolPriceMap.set(symbol, priceMap);
      } else {
        for (const [date, price] of priceMap) {
          symbolPriceMap.get(symbol)!.set(date, price);
        }
      }
    }

    // 交易日聯集：任何 symbol 有資料的日期都算交易日，按日期升序排列
    const tradingDateSet = new Set<string>();
    for (const [, pm] of symbolPriceMap) {
      for (const date of pm.keys()) tradingDateSet.add(date);
    }
    const tradingDates = [...tradingDateSet].sort();

    // 每日匯率（forward-fill 補缺口）
    const denseRateMap = buildDenseRateMap(fxSparse, tradingDates);
    const getSharesAtDate = makeSharesResolver(sellsResult.data || []);

    // 以相鄰「交易日」為單位計算損益（自動涵蓋週一←→上個 Friday，不再丟資料）
    const pnlData: DailyPnLPoint[] = [];

    for (let i = 1; i < tradingDates.length; i++) {
      const today = tradingDates[i];
      const yesterday = tradingDates[i - 1];
      let dailyPnL = 0;

      for (const holding of holdings as Holding[]) {
        const shares = getSharesAtDate(holding, today);
        if (shares <= 0) continue;

        const pm = symbolPriceMap.get(holding.symbol);
        const todayPrice = pm?.get(today);
        const yesterdayPrice = pm?.get(yesterday);

        if (todayPrice !== undefined && yesterdayPrice !== undefined) {
          const priceChange = todayPrice - yesterdayPrice;
          let pnl = priceChange * shares;
          if (holding.market === 'US') {
            pnl *= denseRateMap.get(today) ?? 32;
          }
          dailyPnL += pnl;
        }
      }

      if (dailyPnL !== 0) {
        pnlData.push({ date: today, pnl: Math.round(dailyPnL) });
      }
    }

    return NextResponse.json({ data: pnlData.slice(-days) });
  } catch (err) {
    console.error('計算每日損益失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
