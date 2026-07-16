import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSession, getVisiblePortfolioIdsForRole, scopeQuery } from '@/lib/auth';
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
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7', 10);
    const portfolioId = searchParams.get('portfolio_id');

    // 自訂區間：start/end 皆為 YYYY-MM-DD，兩者齊備才啟用
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const customMode = Boolean(startParam && endParam);
    if (customMode && (!dateRe.test(startParam!) || !dateRe.test(endParam!) || startParam! > endParam!)) {
      return NextResponse.json({ error: '日期區間格式錯誤' }, { status: 400 });
    }

    const visibleIds = await getVisiblePortfolioIdsForRole(session);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();

    // 不加 shares>0 過濾，需要含軟刪除的 lot 來重建歷史持股量
    let query = scopeQuery(supabase.from('holdings').select('*'), session);
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

    let startDateStr: string;
    let endDateStr: string;
    if (customMode) {
      endDateStr = endParam!;
      // 往前多抓 10 日曆天，確保涵蓋區間首日的「前一個交易日」以計算當日損益
      const s = new Date(startParam!);
      s.setDate(s.getDate() - 10);
      startDateStr = s.toISOString().split('T')[0];
    } else {
      const endDate = new Date();
      const startDate = new Date();
      // 多抓 2.5 倍日曆天，確保涵蓋足夠交易日
      startDate.setDate(startDate.getDate() - Math.ceil(days * 2.5));
      startDateStr = startDate.toISOString().split('T')[0];
      endDateStr = endDate.toISOString().split('T')[0];
    }

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
      scopeQuery(
        supabase
          .from('transactions')
          .select('holding_id, shares, transaction_date')
          .in('holding_id', holdingIds)
          .eq('type', 'sell'),
        session
      ),
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
        // 用「昨日」持股量乘以價差：避免今天才買的股數套用昨日→今日價差（虛報），
        // 也避免今天賣出的股數被排除（少報賣前漲跌）。
        const shares = getSharesAtDate(holding, yesterday);
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

    const result = customMode
      ? pnlData.filter((p) => p.date >= startParam! && p.date <= endParam!)
      : pnlData.slice(-days);
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('計算每日損益失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
