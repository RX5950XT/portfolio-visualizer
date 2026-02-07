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
}

// GET: 取得資產走勢資料
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    const supabase = createServerClient();

    // 取得持股（可過濾投資組合）
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

    // 取得當前匯率
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

    // 產生日期序列（從最早買入日到今天）
    const startDate = new Date(earliestDate);
    const endDate = new Date();
    const dateList: string[] = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dateList.push(dateStr);
    }

    // 計算每日總資產價值
    const chartData: ChartDataPoint[] = [];
    let lastKnownPrices: Map<string, number> = new Map();

    for (const date of dateList) {
      let dailyTotal = 0;

      for (const holding of holdings as Holding[]) {
        // 只計算已買入的持股
        if (holding.purchase_date > date) {
          continue;
        }

        const priceMap = historyMap.get(holding.symbol);
        let price = priceMap?.get(date);

        // 如果當天沒有價格（例如週末），使用最近一天的價格
        if (!price) {
          price = lastKnownPrices.get(holding.symbol);
        } else {
          lastKnownPrices.set(holding.symbol, price);
        }

        if (price) {
          const shares = Number(holding.shares);
          const value = shares * price;

          // 美股轉換為 TWD
          if (holding.market === 'US') {
            dailyTotal += value * exchangeRate;
          } else {
            dailyTotal += value;
          }
        }
      }

      // 只加入有價值的日期（跳過資料開始前的日期）
      if (dailyTotal > 0) {
        chartData.push({
          date,
          value: Math.round(dailyTotal),
        });
      }
    }

    return NextResponse.json({ data: chartData });
  } catch (err) {
    console.error('計算資產走勢失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
