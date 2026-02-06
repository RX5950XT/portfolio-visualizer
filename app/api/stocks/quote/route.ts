import { NextResponse } from 'next/server';
import { fetchQuote, fetchMultipleQuotes } from '@/lib/stocks';

// GET: 取得股票報價
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get('symbols');

  if (!symbols) {
    return NextResponse.json({ error: '請提供股票代號' }, { status: 400 });
  }

  const symbolList = symbols.split(',').map((s) => s.trim().toUpperCase());

  if (symbolList.length === 1) {
    const quote = await fetchQuote(symbolList[0]);
    if (!quote) {
      return NextResponse.json({ error: '無法取得股價' }, { status: 404 });
    }
    return NextResponse.json({ data: quote });
  }

  const quotes = await fetchMultipleQuotes(symbolList);
  const result = Object.fromEntries(quotes);
  return NextResponse.json({ data: result });
}
