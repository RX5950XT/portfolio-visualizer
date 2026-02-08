import { NextResponse } from 'next/server';
import { fetchQuote } from '@/lib/stocks';

// 從 Yahoo Finance 取得 ETF 費用率
async function fetchETFExpenseRatio(symbol: string): Promise<number | null> {
  try {
    // Yahoo Finance V10 API 提供基金資訊
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=fundProfile`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 86400 }, // 24 小時快取
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const fundProfile = data.quoteSummary?.result?.[0]?.fundProfile;
    
    // 費用率可能在不同欄位
    const expenseRatio = 
      fundProfile?.feesExpensesInvestment?.annualReportExpenseRatio?.raw ||
      fundProfile?.feesExpensesInvestment?.netExpenseRatio?.raw ||
      null;
    
    return expenseRatio;
  } catch (error) {
    console.error(`取得 ${symbol} 費用率失敗:`, error);
    return null;
  }
}

// 常見 ETF 費用率備用資料（手動維護）
const FALLBACK_EXPENSE_RATIOS: Record<string, number> = {
  // 美股 ETF - Vanguard
  'VOO': 0.0003,
  'VTI': 0.0003,
  'VT': 0.0007,
  'VXUS': 0.0007,
  'VEU': 0.0007,   // Vanguard FTSE All-World ex-US
  'VGT': 0.0010,
  'VNQ': 0.0012,
  'BND': 0.0003,
  // 美股 ETF - iShares
  'IVV': 0.0003,
  'IJH': 0.0005,   // iShares Core S&P Mid-Cap
  'EWY': 0.0059,   // iShares MSCI South Korea
  'SOXX': 0.0035,  // iShares Semiconductor
  // 美股 ETF - SPDR / State Street
  'SPY': 0.0009,
  'XLP': 0.0009,   // Consumer Staples Select Sector SPDR
  // 美股 ETF - 其他
  'QQQ': 0.0020,
  'ARKK': 0.0075,
  'NLR': 0.0060,   // VanEck Uranium+Nuclear Energy
  // 台股 ETF（常見）
  '0050.TW': 0.0043,
  '0056.TW': 0.0066,
  '00878.TW': 0.0056,
  '00692.TW': 0.0035,
  '006208.TW': 0.0015,
};

// GET: 取得 ETF 費用率
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: '請提供 ETF 代號' }, { status: 400 });
  }

  const upperSymbol = symbol.toUpperCase();
  
  // 先嘗試從 Yahoo Finance 取得
  let expenseRatio = await fetchETFExpenseRatio(upperSymbol);
  let source: 'auto' | 'manual' = 'auto';
  
  // 如果失敗，使用備用資料
  if (expenseRatio === null && FALLBACK_EXPENSE_RATIOS[upperSymbol]) {
    expenseRatio = FALLBACK_EXPENSE_RATIOS[upperSymbol];
    source = 'manual';
  }
  
  // 確認是否為 ETF（嘗試取得報價確認）
  if (expenseRatio === null) {
    const quote = await fetchQuote(upperSymbol);
    if (!quote) {
      return NextResponse.json({ error: '找不到此標的' }, { status: 404 });
    }
    // 有報價但沒費用率，可能不是 ETF
    return NextResponse.json({ 
      data: { 
        symbol: upperSymbol, 
        expense_ratio: null, 
        source: null,
        message: '此標的可能不是 ETF，或費用率資料暫時無法取得'
      } 
    });
  }

  return NextResponse.json({ 
    data: { 
      symbol: upperSymbol, 
      expense_ratio: expenseRatio, 
      source,
      updated_at: new Date().toISOString()
    } 
  });
}
