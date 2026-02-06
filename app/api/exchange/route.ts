import { NextResponse } from 'next/server';
import { fetchExchangeRate } from '@/lib/stocks';

// GET: 取得 USD/TWD 匯率
export async function GET() {
  const rate = await fetchExchangeRate();
  
  if (!rate) {
    return NextResponse.json({ error: '無法取得匯率' }, { status: 500 });
  }

  return NextResponse.json({ 
    data: { 
      rate, 
      from: 'USD', 
      to: 'TWD',
      updatedAt: new Date().toISOString() 
    } 
  });
}
