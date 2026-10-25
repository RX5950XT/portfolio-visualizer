import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getVisiblePortfolioIdsForRole, scopeQuery, type Session } from '@/lib/auth';
import { fetchHistory } from '@/lib/stocks';
import { fetchFxHistory, buildDenseRateMap, makeSharesResolver } from '@/lib/portfolio-history';
import { taipeiDate } from '@/lib/chart-period';

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
export async function getDailyPnl(request: Request, session: Session) {
  try {

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
      // 多抓 2.5 倍日曆天，確保涵蓋足夠交易日；結束日用台北今天
      endDateStr = taipeiDate(new Date());
      startDateStr = new Date(Date.parse(endDateStr) - Math.ceil(days * 2.5) * 86_400_000)
        .toISOString()
        .slice(0, 10);
    }

    const holdingIds = holdings.map((h: Holding) => h.id);
    const uniqueSymbols = [...new Set((holdings as Holding[]).map((h) => h.symbol))];

    // 並行取得：各標的歷史股價 + 歷史匯率 + 賣出交易
    const [historyResults, fxSparse, sellsResult] = await Promise.all([
      // 每檔只抓一次，減少 Yahoo 限流造成的缺價
      Promise.all(
        uniqueSymbols.map(async (symbol) => {
          const history = await fetchHistory(symbol, { startDate: startDateStr, endDate: endDateStr });
          const priceMap = new Map<string, number>();
          history.forEach((p) => priceMap.set(p.date, p.close));
          return { symbol, priceMap };
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

    const symbolPriceMap = new Map(historyResults.map((r) => [r.symbol, r.priceMap]));

    // 交易日聯集：任何 symbol 有資料的日期都算交易日，按日期升序排列
    const tradingDateSet = new Set<string>();
    for (const [, pm] of symbolPriceMap) {
      for (const date of pm.keys()) tradingDateSet.add(date);
    }
    const tradingDates = [...tradingDateSet].sort();

    // 每日匯率（forward-fill 補缺口）
    const denseRateMap = buildDenseRateMap(fxSparse, tradingDates);
    // 每檔收盤也 forward-fill：台美休市日不同，休市那天沿用前收，休市前後的漲跌才不會整段消失
    const densePriceMap = new Map<string, Map<string, number>>();
    for (const [symbol, pm] of symbolPriceMap) {
      if (pm.size > 0) densePriceMap.set(symbol, buildDenseRateMap(pm, tradingDates));
    }
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

        const pm = densePriceMap.get(holding.symbol);
        const todayPrice = pm?.get(today);
        const yesterdayPrice = pm?.get(yesterday);

        if (todayPrice !== undefined && yesterdayPrice !== undefined) {
          // 美股用台幣市值變化：同時含股價與匯率的漲跌，加總才對得上資產變化
          const isUS = holding.market === 'US';
          const fxToday = isUS ? denseRateMap.get(today) ?? 32 : 1;
          const fxYesterday = isUS ? denseRateMap.get(yesterday) ?? 32 : 1;
          dailyPnL += shares * (todayPrice * fxToday - yesterdayPrice * fxYesterday);
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
