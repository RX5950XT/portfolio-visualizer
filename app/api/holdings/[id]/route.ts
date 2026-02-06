import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PUT: 更新持股
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { symbol, shares, cost_price, purchase_date } = body;
    
    const upperSymbol = symbol?.toUpperCase();
    const market = upperSymbol?.includes('.TW') ? 'TW' : 'US';
    
    const supabase = createServerClient();
    
    const { data, error } = await supabase
      .from('holdings')
      .update({
        symbol: upperSymbol,
        shares: parseFloat(shares),
        cost_price: parseFloat(cost_price),
        purchase_date,
        market,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('更新持股失敗:', error);
      return NextResponse.json({ error: '更新持股失敗' }, { status: 500 });
    }
    
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// DELETE: 刪除持股
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    
    const { error } = await supabase
      .from('holdings')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('刪除持股失敗:', error);
      return NextResponse.json({ error: '刪除持股失敗' }, { status: 500 });
    }
    
    return NextResponse.json({ data: { success: true } });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
