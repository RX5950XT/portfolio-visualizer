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

    // 並行取得：各標的歷史股價 + 歷史匯率 + 賣出交易（用於重建歷史持股量）
    const [historyResults, fxSparse, sellsResult] = await Promise.all([
      Promise.all(
        holdings.map(async (h: Holding) => {
          const history = await fetchHistory(h.symbol, { startDate: earliestDate });
          const priceMap = new Map<string, number>();
          history.forEach((p) => priceMap.set(p.date, p.close));
          return { symbol: h.symbol, priceMap };
        })
      ),
      fetchFxHistory(earliestDate),
      supabase
        .from('transactions')
        .select('holding_id, shares, transaction_date')
        .in('holding_id', holdingIds)
        .eq('type', 'sell'),
    ]);

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

    // 每日匯率（逐日，forward-fill 補非交易日）
    const denseRateMap = buildDenseRateMap(fxSparse, dateList);

    // 計算每日市值 + 成本
    const chartData: ChartDataPoint[] = [];
    const lastKnownPrices = new Map<string, number>();

    for (const date of dateList) {
      let dailyValue = 0;
      let dailyCost = 0;
      let hasAnyHolding = false;

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
      }

      if (hasAnyHolding && dailyValue > 0) {
        chartData.push({ date, value: Math.round(dailyValue), cost: Math.round(dailyCost) });
      }
    }

    return NextResponse.json({ data: chartData });
  } catch (err) {
    console.error('計算資產走勢失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
