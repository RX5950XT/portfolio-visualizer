import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserRole } from '@/lib/auth';

// 權限檢查輔助函式
async function requireAdmin() {
  const role = await getUserRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: '無權限執行此操作' }, { status: 403 });
  }
  return null;
}

// GET: 取得現金餘額
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    const supabase = createServerClient();

    let query = supabase.from('cash_balance').select('*');

    // 如果指定了投資組合，過濾現金
    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    }

    const { data, error } = await query.single();

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
    // 權限檢查：只有管理員可以更新現金餘額
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const body = await request.json();
    const { amount_twd, portfolio_id } = body;

    if (typeof amount_twd !== 'number' || isNaN(amount_twd)) {
      return NextResponse.json({ error: '金額格式錯誤' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 先嘗試查詢現有記錄
    let query = supabase.from('cash_balance').select('id');
    if (portfolio_id) {
      query = query.eq('portfolio_id', portfolio_id);
    }

    const { data: existingData, error: selectError } = await query.single();

    if (selectError && selectError.code !== 'PGRST116') {
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
      const insertData: { amount_twd: number; portfolio_id?: string } = { amount_twd };
      if (portfolio_id) {
        insertData.portfolio_id = portfolio_id;
      }

      result = await supabase
        .from('cash_balance')
        .insert(insertData)
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
