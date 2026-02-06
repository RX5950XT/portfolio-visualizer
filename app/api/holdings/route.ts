import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { Holding } from '@/types';

// GET: 取得所有持股
export async function GET() {
  try {
    const supabase = createServerClient();
    
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('取得持股失敗:', error);
      return NextResponse.json({ error: '取得持股失敗' }, { status: 500 });
    }
    
    return NextResponse.json({ data: data as Holding[] });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// POST: 新增持股
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbol, shares, cost_price, purchase_date } = body;
    
    // 驗證必填欄位
    if (!symbol || !shares || !cost_price || !purchase_date) {
      return NextResponse.json({ error: '請填寫所有必填欄位' }, { status: 400 });
    }
    
    // 判斷市場（台股或美股）
    const upperSymbol = symbol.toUpperCase();
    const market = upperSymbol.includes('.TW') ? 'TW' : 'US';
    
    const supabase = createServerClient();
    
    const { data, error } = await supabase
      .from('holdings')
      .insert({
        symbol: upperSymbol,
        shares: parseFloat(shares),
        cost_price: parseFloat(cost_price),
        purchase_date,
        market,
      })
      .select()
      .single();
    
    if (error) {
      console.error('新增持股失敗:', error);
      return NextResponse.json({ error: '新增持股失敗' }, { status: 500 });
    }
    
    return NextResponse.json({ data: data as Holding });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
