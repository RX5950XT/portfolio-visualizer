import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { fetchHistory, fetchExchangeRate } from '@/lib/stocks';

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
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    const supabase = createServerClient();

    let query = supabase
      .from('holdings')
      .select('*')
      .order('purchase_date', { ascending: true });

    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    }

    const { data: holdings, error } = await query;

    if (error) {
      console.error('取得持股失敗:', error);
      return NextResponse.json({ error: '取得持股失敗' }, { status: 500 });
    }

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const exchangeRate = (await fetchExchangeRate()) || 32;

    // 找出最早的買入日期
    const earliestDate = holdings.reduce((min, h) => {
      return h.purchase_date < min ? h.purchase_date : min;
    }, holdings[0].purchase_date);

    // 取得所有持股的歷史股價
    const historyMap = new Map<string, Map<string, number>>();

    await Promise.all(
      holdings.map(async (holding: Holding) => {
        const history = await fetchHistory(holding.symbol, {
          startDate: earliestDate,
        });

        const priceMap = new Map<string, number>();
        history.forEach((h) => {
          priceMap.set(h.date, h.close);
        });
        historyMap.set(holding.symbol, priceMap);
      })
    );

    // 產生日期序列
    const startDate = new Date(earliestDate);
    const endDate = new Date();
    const dateList: string[] = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dateList.push(dateStr);
    }

    // 計算每日市值 + 成本
    const chartData: ChartDataPoint[] = [];
    let lastKnownPrices: Map<string, number> = new Map();

    for (const date of dateList) {
      let dailyValue = 0;
      let dailyCost = 0;
      let hasAnyHolding = false;

      for (const holding of holdings as Holding[]) {
        // 只計算已買入的持股
        if (holding.purchase_date > date) continue;

        hasAnyHolding = true;

        // 成本線：該 lot 的買入總成本（TWD）
        const shares = Number(holding.shares);
        const costPerShare = Number(holding.cost_price);
        const lotCost = shares * costPerShare;
        const isUS = holding.market === 'US';
        dailyCost += isUS ? lotCost * exchangeRate : lotCost;

        // 市值線：當日收盤價 × 股數（TWD）
        const priceMap = historyMap.get(holding.symbol);
        let price = priceMap?.get(date);

        if (!price) {
          price = lastKnownPrices.get(holding.symbol);
        } else {
          lastKnownPrices.set(holding.symbol, price);
        }

        if (price) {
          const value = shares * price;
          dailyValue += isUS ? value * exchangeRate : value;
        }
      }

      if (hasAnyHolding && dailyValue > 0) {
        chartData.push({
          date,
          value: Math.round(dailyValue),
          cost: Math.round(dailyCost),
        });
      }
    }

    return NextResponse.json({ data: chartData });
  } catch (err) {
    console.error('計算資產走勢失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
