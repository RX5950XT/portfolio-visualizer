import { NextResponse } from 'next/server';
import { fetchQuote } from '@/lib/stocks';

// 從 Yahoo Finance 取得 quoteType 判斷是否為 ETF
async function fetchQuoteType(symbol: string): Promise<string | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) return null;

    const data = await res.json();
    // quoteType 欄位：EQUITY（個股）、ETF（ETF）、MUTUALFUND 等
    return data.chart?.result?.[0]?.meta?.instrumentType || null;
  } catch {
    return null;
  }
}

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

// 常見 ETF 費用率備用資料（當 API 無回應時使用）
const FALLBACK_EXPENSE_RATIOS: Record<string, number> = {
  // 美股 ETF - Vanguard
  'VOO': 0.0003,
  'VTI': 0.0003,
  'VT': 0.0005,
  'VXUS': 0.0005,
  'VEU': 0.0004,
  'VGT': 0.0010,
  'VNQ': 0.0012,
  'BND': 0.0003,
  // 美股 ETF - iShares
  'IVV': 0.0003,
  'IJH': 0.0005,
  'EWY': 0.0059,
  'SOXX': 0.0035,
  // 美股 ETF - SPDR / State Street
  'SPY': 0.0009,
  'XLP': 0.0009,
  // 美股 ETF - 其他
  'QQQ': 0.0020,
  'ARKK': 0.0075,
  'NLR': 0.0060,
  // 台股 ETF
  '0050.TW': 0.0043,
  '0056.TW': 0.0066,
  '00878.TW': 0.0056,
  '00692.TW': 0.0035,
  '006208.TW': 0.0015,
};

// GET: 取得 ETF 費用率（自動判斷是否為 ETF）
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: '請提供標的代號' }, { status: 400 });
  }

  const upperSymbol = symbol.toUpperCase();
  
  // 透過 Yahoo Finance 判斷標的類型
  const quoteType = await fetchQuoteType(upperSymbol);
  const isETF = quoteType === 'ETF';
  
  // 如果 API 明確判定不是 ETF，且備用清單也沒有，直接回傳
  if (quoteType && !isETF && !FALLBACK_EXPENSE_RATIOS[upperSymbol]) {
    return NextResponse.json({ 
      data: { 
        symbol: upperSymbol, 
        expense_ratio: null, 
        is_etf: false,
        source: null,
      } 
    });
  }

  // 嘗試從 Yahoo Finance 取得費用率
  let expenseRatio = await fetchETFExpenseRatio(upperSymbol);
  let source: 'api' | 'fallback' = 'api';
  
  // 如果 API 失敗，使用備用資料
  if (expenseRatio === null && FALLBACK_EXPENSE_RATIOS[upperSymbol]) {
    expenseRatio = FALLBACK_EXPENSE_RATIOS[upperSymbol];
    source = 'fallback';
  }
  
  // 如果都取不到費用率
  if (expenseRatio === null) {
    // 確認標的是否存在
    const quote = await fetchQuote(upperSymbol);
    if (!quote) {
      return NextResponse.json({ error: '找不到此標的' }, { status: 404 });
    }
    return NextResponse.json({ 
      data: { 
        symbol: upperSymbol, 
        expense_ratio: null, 
        is_etf: isETF || FALLBACK_EXPENSE_RATIOS[upperSymbol] !== undefined,
        source: null,
      } 
    });
  }

  return NextResponse.json({ 
    data: { 
      symbol: upperSymbol, 
      expense_ratio: expenseRatio, 
      is_etf: true,
      source,
      updated_at: new Date().toISOString()
    } 
  });
}
