import { NextResponse } from 'next/server';
import { fetchHistory } from '@/lib/stocks';

// GET: 取得歷史股價
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const range = searchParams.get('range') as '1mo' | '3mo' | '6mo' | '1y' | '5y' | null;

  if (!symbol) {
    return NextResponse.json({ error: '請提供股票代號' }, { status: 400 });
  }

  const history = await fetchHistory(symbol.toUpperCase(), { range: range || '1mo' });
  
  if (history.length === 0) {
    return NextResponse.json({ error: '無法取得歷史數據' }, { status: 404 });
  }

  return NextResponse.json({ data: history });
}
