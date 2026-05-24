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

interface ChartDataPoint {
  date: string;
  value: number;
  cost: number;
  benchmark: number;
}

// GET: 取得資產走勢資料（市值線 + 成本線）
export async function GET(request: Request) {
  try {
    const role = await getUserRole();
    if (!role) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    const visibleIds = await getVisiblePortfolioIdsForRole(role);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();

    // 不加 shares>0 過濾，需要含軟刪除的 lot 來重建歷史持股量
    let holdingsQuery = supabase
      .from('holdings')
      .select('*')
      .order('purchase_date', { ascending: true });

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

    // 並行取得：各標的歷史股價 + 歷史匯率 + S&P 500 對照價格 + 賣出交易（用於重建歷史持股量）
    const [historyResults, fxSparse, spHistory, sellsResult] = await Promise.all([
      Promise.all(
        holdings.map(async (h: Holding) => {
          const history = await fetchHistory(h.symbol, { startDate: earliestDate });
          const priceMap = new Map<string, number>();
          history.forEach((p) => priceMap.set(p.date, p.close));
          return { symbol: h.symbol, priceMap };
        })
      ),
      fetchFxHistory(earliestDate),
      fetchHistory('^GSPC', { startDate: earliestDate }),
      supabase
        .from('transactions')
        .select('holding_id, shares, transaction_date')
        .in('holding_id', holdingIds)
        .eq('type', 'sell'),
    ]);

    const spSparse = new Map<string, number>();
    for (const p of spHistory) spSparse.set(p.date, p.close);

    const historyMap = new Map<string, Map<string, number>>();
    for (const { symbol, priceMap } of historyResults) {
      if (!historyMap.has(symbol)) {
        historyMap.set(symbol, priceMap);
      } else {
        for (const [date, price] of priceMap) {
          historyMap.get(symbol)!.set(date, price);
        }
      }
    }

    const getSharesAtDate = makeSharesResolver(sellsResult.data || []);

    // 產生日曆日期序列（forward-fill 補非交易日）
    const startDate = new Date(earliestDate);
    const endDate = new Date();
    const dateList: string[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dateList.push(d.toISOString().split('T')[0]);
    }

    // 每日匯率與 S&P 500 價格（逐日，forward/back-fill 補非交易日）
    const denseRateMap = buildDenseRateMap(fxSparse, dateList);
    const spDense = buildDenseRateMap(spSparse, dateList);

    // 預計算每筆 lot 的 benchmark 基準：當初投入的 TWD 改買 ^GSPC 能換到多少「股」
    // spPrice 為 USD，故 TWD 投入需先用買入日匯率換成 USD 再除價；缺價/匯率時該 lot 視為 0（不污染整條線）
    const spSharesByLot = new Map<string, number>();
    for (const holding of holdings as Holding[]) {
      const originalShares = getSharesAtDate(holding, holding.purchase_date);
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

      for (const holding of holdings as Holding[]) {
        const shares = getSharesAtDate(holding, date);
        if (shares <= 0) continue;

        hasAnyHolding = true;
        const isUS = holding.market === 'US';
        const rate = isUS ? (denseRateMap.get(date) ?? 32) : 1;

        const lotCost = shares * Number(holding.cost_price);
        dailyCost += isUS ? lotCost * rate : lotCost;

        const priceMap = historyMap.get(holding.symbol);
        let price = priceMap?.get(date);
        if (price === undefined) {
          price = lastKnownPrices.get(holding.symbol);
        } else {
          lastKnownPrices.set(holding.symbol, price);
        }

        if (price) {
          dailyValue += isUS ? shares * price * rate : shares * price;
        }

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
