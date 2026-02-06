import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET: 取得現金餘額
export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('cash_balance')
      .select('*')
      .single();

    if (error) {
      // 如果表格不存在或沒有資料，回傳預設值
      if (error.code === 'PGRST116' || error.code === '42P01') {
        return NextResponse.json({ data: { amount_twd: 0 } });
      }
      console.error('取得現金餘額失敗:', error);
      return NextResponse.json({ data: { amount_twd: 0 } });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('取得現金餘額錯誤:', err);
    return NextResponse.json({ data: { amount_twd: 0 } });
  }
}

// PUT: 更新現金餘額
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { amount_twd } = body;

    if (typeof amount_twd !== 'number' || isNaN(amount_twd)) {
      return NextResponse.json({ error: '金額格式錯誤' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 先嘗試更新
    const { data: existingData, error: selectError } = await supabase
      .from('cash_balance')
      .select('id')
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      // 表格可能不存在，嘗試建立
      console.error('查詢現金餘額失敗:', selectError);
    }

    let result;
    if (existingData) {
      // 更新現有記錄
      result = await supabase
        .from('cash_balance')
        .update({
          amount_twd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingData.id)
        .select()
        .single();
    } else {
      // 新增記錄
      result = await supabase
        .from('cash_balance')
        .insert({ amount_twd })
        .select()
        .single();
    }

    if (result.error) {
      console.error('更新現金餘額失敗:', result.error);
      return NextResponse.json({ error: '更新現金餘額失敗' }, { status: 500 });
    }

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error('更新現金餘額錯誤:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
