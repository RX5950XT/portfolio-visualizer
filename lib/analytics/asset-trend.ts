import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getVisiblePortfolioIdsForRole, scopeQuery, type Session } from '@/lib/auth';
import { fetchHistory, fetchMultipleQuotes, fetchExchangeRate } from '@/lib/stocks';
import {
  fetchFxHistory,
  buildDenseRateMap,
  makeSharesResolver,
  calendarDates,
} from '@/lib/portfolio-history';
import { sharesAcquired } from '@/lib/metrics';

interface Holding {
  id: string;
  symbol: string;
  shares: number;
  cost_price: number;
  purchase_date: string;
  market: 'US' | 'TW';
}

interface ChartDataPoint {
  date: string;
  value: number;
  cost: number;
  benchmark: number;
}

// GET: 取得資產走勢資料（市值線 + 成本線）
export async function getAssetTrend(request: Request, session: Session) {
  try {

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    const visibleIds = await getVisiblePortfolioIdsForRole(session);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();

    // 不加 shares>0 過濾，需要含軟刪除的 lot 來重建歷史持股量
    let holdingsQuery = scopeQuery(supabase.from('holdings').select('*'), session).order(
      'purchase_date',
      { ascending: true }
    );

    if (portfolioId) {
      holdingsQuery = holdingsQuery.eq('portfolio_id', portfolioId);
    } else if (visibleIds !== null) {
      if (visibleIds.length === 0) return NextResponse.json({ data: [] });
      holdingsQuery = holdingsQuery.in('portfolio_id', visibleIds);
    }

    const { data: holdings, error } = await holdingsQuery;
    if (error) {
      console.error('取得持股失敗:', error);
      return NextResponse.json({ error: '取得持股失敗' }, { status: 500 });
    }
    if (!holdings || holdings.length === 0) return NextResponse.json({ data: [] });

    // 找出最早買入日期
    const earliestDate = holdings.reduce((min: string, h: Holding) =>
      h.purchase_date < min ? h.purchase_date : min, holdings[0].purchase_date
    );

    const holdingIds = holdings.map((h: Holding) => h.id);
    const uniqueSymbols = [...new Set((holdings as Holding[]).map((h) => h.symbol))];

    // 並行取得：各標的歷史股價 + 歷史匯率 + S&P 500 對照價格 + 賣出交易（重建歷史持股量）
    // + 即時報價與即時匯率：僅用來覆蓋「今天」這一格，與 dashboard 卡片同源
    const [historyResults, fxSparse, spHistory, sellsResult, liveQuotes, liveRate] =
      await Promise.all([
        // 每檔只抓一次，減少 Yahoo 限流造成的缺價
        Promise.all(
          uniqueSymbols.map(async (symbol) => {
            const history = await fetchHistory(symbol, { startDate: earliestDate });
            const priceMap = new Map<string, number>();
            history.forEach((p) => priceMap.set(p.date, p.close));
            return { symbol, priceMap };
          })
        ),
        fetchFxHistory(earliestDate),
        fetchHistory('^GSPC', { startDate: earliestDate }),
        scopeQuery(
          supabase
            .from('transactions')
            .select('holding_id, shares, transaction_date')
            .in('holding_id', holdingIds)
            .eq('type', 'sell'),
          session
        ),
        fetchMultipleQuotes([...uniqueSymbols, '^GSPC']),
        fetchExchangeRate(),
      ]);

    const spSparse = new Map<string, number>();
    for (const p of spHistory) spSparse.set(p.date, p.close);

    const historyMap = new Map(historyResults.map((r) => [r.symbol, r.priceMap]));

    const sellRows = sellsResult.data || [];
    const getSharesAtDate = makeSharesResolver(sellRows);

    // 產生日曆日期序列（forward-fill 補非交易日）
    const dateList = calendarDates(earliestDate);

    // 每日匯率與 S&P 500 價格（逐日，forward/back-fill 補非交易日）
    const denseRateMap = buildDenseRateMap(fxSparse, dateList);
    const spDense = buildDenseRateMap(spSparse, dateList);

    // 「今天」用即時報價/匯率覆蓋歷史 forward-fill：歷史 API 當日收盤常缺值（尤其台股），
    // 會讓末點沿用昨價、與卡片即時值對不上。抓不到報價時自動退回 forward-fill。
    const today = dateList[dateList.length - 1];
    for (const [symbol, q] of liveQuotes) {
      const price = q.regularMarketPrice;
      if (!price || price <= 0) continue;
      if (symbol === '^GSPC') {
        spDense.set(today, price);
      } else {
        if (!historyMap.has(symbol)) historyMap.set(symbol, new Map());
        historyMap.get(symbol)!.set(today, price);
      }
    }
    if (liveRate && liveRate > 0) denseRateMap.set(today, liveRate);

    // 預計算每筆 lot 的 benchmark 基準：當初投入的 TWD 改買 ^GSPC 能換到多少「股」
    // spPrice 為 USD，故 TWD 投入需先用買入日匯率換成 USD 再除價；缺價/匯率時該 lot 視為 0（不污染整條線）
    const spSharesByLot = new Map<string, number>();
    for (const holding of holdings as Holding[]) {
      // 買入當天又賣掉的股數也是當初投入的一部分
      const soldSameDay = sellRows
        .filter((s) => s.holding_id === holding.id && s.transaction_date === holding.purchase_date)
        .reduce((sum, s) => sum + Number(s.shares), 0);
      const originalShares = sharesAcquired(
        getSharesAtDate(holding, holding.purchase_date),
        soldSameDay
      );
      const isUS = holding.market === 'US';
      const fxAtPurchase = denseRateMap.get(holding.purchase_date) ?? 0;
      const spPriceAtPurchase = spDense.get(holding.purchase_date) ?? 0;
      const contributionTwd = originalShares * Number(holding.cost_price) * (isUS ? fxAtPurchase : 1);
      const denom = spPriceAtPurchase * fxAtPurchase;
      const spSharesFull = denom > 0 && originalShares > 0 ? contributionTwd / denom : 0;
      // 存「每原始股對應的 S&P 股數」，每日再乘上當日持股比例
      spSharesByLot.set(holding.id, originalShares > 0 ? spSharesFull / originalShares : 0);
    }

    // 計算每日市值 + 成本 + S&P 500 對照值
    const chartData: ChartDataPoint[] = [];
    const lastKnownPrices = new Map<string, number>();

    for (const date of dateList) {
      let dailyValue = 0;
      let dailyCost = 0;
      let dailyBenchmark = 0;
      let hasAnyHolding = false;

      // S&P 對照：當日 ^GSPC 價格（USD）× 當日匯率，全持股共用
      const spPrice = spDense.get(date) ?? 0;
      const spRate = denseRateMap.get(date) ?? 32;

      // 不論當天是否持有都更新最後收盤，假日買進才拿得到前一個交易日的價格
      for (const [symbol, priceMap] of historyMap) {
        const close = priceMap.get(date);
        if (close !== undefined) lastKnownPrices.set(symbol, close);
      }

      for (const holding of holdings as Holding[]) {
        const shares = getSharesAtDate(holding, date);
        if (shares <= 0) continue;

        hasAnyHolding = true;
        const isUS = holding.market === 'US';
        const rate = isUS ? (denseRateMap.get(date) ?? 32) : 1;

        // 成本用買入日匯率：成本線是當初投入的台幣，不隨匯率起伏（與首頁未實現損益同口徑）
        const lotCost = shares * Number(holding.cost_price);
        dailyCost += isUS ? lotCost * (denseRateMap.get(holding.purchase_date) ?? rate) : lotCost;

        // 尚無任何收盤價（新上市、抓價失敗）時以成本估值，避免市值憑空歸零再跳回
        const price = lastKnownPrices.get(holding.symbol) || Number(holding.cost_price);
        dailyValue += isUS ? shares * price * rate : shares * price;

        // 比照賣出：用當日持股 shares 等比例縮放，與市值線同步
        const spPerShare = spSharesByLot.get(holding.id) ?? 0;
        dailyBenchmark += spPerShare * shares * spPrice * spRate;
      }

      if (hasAnyHolding && dailyValue > 0) {
        chartData.push({
          date,
          value: Math.round(dailyValue),
          cost: Math.round(dailyCost),
          benchmark: Math.round(dailyBenchmark),
        });
      }
    }

    return NextResponse.json({ data: chartData });
  } catch (err) {
    console.error('計算資產走勢失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
