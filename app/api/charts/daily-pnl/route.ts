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

interface DailyPnLPoint {
  date: string;
  pnl: number; // 當日損益（價格變動 × 股數）
}

// GET: 取得每日損益資料（最近 7 天）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7', 10);
    const portfolioId = searchParams.get('portfolio_id');

    const supabase = createServerClient();

    // 取得持股（可過濾投資組合）
    let query = supabase.from('holdings').select('*');

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

    // 計算查詢的日期範圍（多抓一天用於計算差值）
    const endDate = new Date();
    const startDate = new Date();
    // 多抓 2.5 倍日曆天，確保涵蓋足夠交易日（排除週末、假日）
    startDate.setDate(startDate.getDate() - Math.ceil(days * 2.5));

    // 取得所有持股的歷史股價
    const historyMap = new Map<string, { date: string; close: number }[]>();

    await Promise.all(
      holdings.map(async (holding: Holding) => {
        const history = await fetchHistory(holding.symbol, {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        });
        historyMap.set(holding.symbol, history);
      })
    );

    // 產生日期序列（最近 N 天）
    const dateList: string[] = [];
    const calendarDays = Math.ceil(days * 2.5);
    for (let i = calendarDays; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dateList.push(d.toISOString().split('T')[0]);
    }

    // 計算每日損益
    const pnlData: DailyPnLPoint[] = [];

    for (let i = 1; i < dateList.length; i++) {
      const today = dateList[i];
      const yesterday = dateList[i - 1];
      let dailyPnL = 0;

      for (const holding of holdings as Holding[]) {
        // 只計算已買入的持股
        if (holding.purchase_date > today) {
          continue;
        }

        const history = historyMap.get(holding.symbol) || [];
        const todayData = history.find((h) => h.date === today);
        const yesterdayData = history.find((h) => h.date === yesterday);

        // 如果有今天和昨天的價格，計算價格變動
        if (todayData && yesterdayData) {
          const priceChange = todayData.close - yesterdayData.close;
          const shares = Number(holding.shares);
          let pnl = priceChange * shares;

          // 美股轉換為 TWD
          if (holding.market === 'US') {
            pnl *= exchangeRate;
          }

          dailyPnL += pnl;
        }
      }

      // 只加入交易日（有資料的日期）
      // 檢查是否有任何持股在這天有價格變動資料
      const hasData = holdings.some((holding: Holding) => {
        const history = historyMap.get(holding.symbol) || [];
        return history.some((h) => h.date === today);
      });

      if (hasData && dailyPnL !== 0) {
        pnlData.push({
          date: today,
          pnl: Math.round(dailyPnL),
        });
      }
    }

    // 只回傳最近 N 個交易日
    return NextResponse.json({ data: pnlData.slice(-days) });
  } catch (err) {
    console.error('計算每日損益失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
