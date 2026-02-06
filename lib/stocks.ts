// Yahoo Finance 股價抓取邏輯

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
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 300 }, // 5 分鐘快取
    });

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

// 取得歷史股價
export async function fetchHistory(
  symbol: string,
  range: '1mo' | '3mo' | '6mo' | '1y' | '5y' = '1mo'
): Promise<{ date: string; close: number }[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 3600 }, // 1 小時快取
    });

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
