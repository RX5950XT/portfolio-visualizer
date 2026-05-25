// Yahoo Finance 股價抓取邏輯

import { fetchQuoteSummary } from '@/lib/yahoo-crumb';

const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// 帶逾時的 fetch：Yahoo 偶爾會卡住連線，無逾時會讓整條請求無限等待
async function fetchWithTimeout(url: string, ms: number, revalidate: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': YAHOO_UA },
      next: { revalidate },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

interface YahooQuoteResult {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  currency: string;
}

// 從 Yahoo Finance 取得即時股價
export async function fetchQuote(symbol: string): Promise<YahooQuoteResult | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

    const res = await fetchWithTimeout(url, 8000, 300); // 5 分鐘快取、8 秒逾時

    if (!res.ok) {
      console.error(`Yahoo Finance API 錯誤: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const result = data.chart?.result?.[0];
    
    if (!result) {
      return null;
    }

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const previousClose = meta.previousClose || meta.chartPreviousClose;
    const currentPrice = meta.regularMarketPrice || quote?.close?.[quote.close.length - 1];
    
    if (!currentPrice) {
      return null;
    }

    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: meta.symbol,
      regularMarketPrice: currentPrice,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      currency: meta.currency || 'USD',
    };
  } catch (error) {
    console.error(`取得 ${symbol} 股價失敗:`, error);
    return null;
  }
}

// 批次取得多個股票報價
export async function fetchMultipleQuotes(symbols: string[]): Promise<Map<string, YahooQuoteResult>> {
  const results = new Map<string, YahooQuoteResult>();
  
  // 並行請求所有股票（限制同時 5 個）
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(async (symbol) => {
      const quote = await fetchQuote(symbol);
      if (quote) {
        results.set(symbol, quote);
      }
    });
    await Promise.all(promises);
  }
  
  return results;
}

// 取得歷史股價（支援自訂日期範圍）
export async function fetchHistory(
  symbol: string,
  options?: {
    range?: '1mo' | '3mo' | '6mo' | '1y' | '5y' | 'max';
    startDate?: string; // YYYY-MM-DD 格式
    endDate?: string;   // YYYY-MM-DD 格式
  }
): Promise<{ date: string; close: number }[]> {
  try {
    let url: string;

    if (options?.startDate) {
      // 使用自訂日期範圍（period1/period2 為 Unix 時間戳）
      const period1 = Math.floor(new Date(options.startDate).getTime() / 1000);
      const period2 = options?.endDate
        ? Math.floor(new Date(options.endDate).getTime() / 1000)
        : Math.floor(Date.now() / 1000);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
    } else {
      // 使用預設範圍
      const range = options?.range || '1mo';
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    }

    const res = await fetchWithTimeout(url, 12000, 3600); // 1 小時快取、12 秒逾時

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      return [];
    }

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];

    return timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      close: closes[i],
    })).filter((item: { close: number }) => item.close != null);
  } catch (error) {
    console.error(`取得 ${symbol} 歷史數據失敗:`, error);
    return [];
  }
}

// 取得歷史配息事件（除息日 + 每股配息，原幣）
export async function fetchDividends(
  symbol: string,
  startDate: string
): Promise<{ date: string; amount: number }[]> {
  try {
    const period1 = Math.floor(new Date(startDate).getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}&events=div`;

    const res = await fetchWithTimeout(url, 12000, 86400); // 24 小時快取、12 秒逾時
    if (!res.ok) return [];

    const data = await res.json();
    const dividends = data.chart?.result?.[0]?.events?.dividends;
    if (!dividends) return [];

    return Object.values(dividends as Record<string, { amount: number; date: number }>)
      .map((d) => ({
        date: new Date(d.date * 1000).toISOString().split('T')[0],
        amount: d.amount,
      }))
      .filter((d) => d.amount > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error(`取得 ${symbol} 配息失敗:`, error);
    return [];
  }
}

// 取得配息概況（年化配息率、除息日、殖利率）；quoteSummary 需 crumb 認證
export async function fetchDividendInfo(
  symbol: string
): Promise<{ annualRate: number | null; exDate: string | null; yield: number | null }> {
  try {
    const result = await fetchQuoteSummary(symbol, 'summaryDetail');
    const detail = result?.summaryDetail as
      | {
          trailingAnnualDividendRate?: { raw?: number };
          exDividendDate?: { raw?: number };
          dividendYield?: { raw?: number };
        }
      | undefined;
    if (!detail) return { annualRate: null, exDate: null, yield: null };

    const exTs = detail.exDividendDate?.raw;
    return {
      annualRate: detail.trailingAnnualDividendRate?.raw ?? null,
      exDate: exTs ? new Date(exTs * 1000).toISOString().split('T')[0] : null,
      yield: detail.dividendYield?.raw ?? null,
    };
  } catch (error) {
    console.error(`取得 ${symbol} 配息概況失敗:`, error);
    return { annualRate: null, exDate: null, yield: null };
  }
}

// 取得 USD/TWD 匯率
export async function fetchExchangeRate(): Promise<number | null> {
  try {
    // 使用 USDTWD=X 取得匯率
    const quote = await fetchQuote('USDTWD=X');
    return quote?.regularMarketPrice || null;
  } catch (error) {
    console.error('取得匯率失敗:', error);
    return null;
  }
}
