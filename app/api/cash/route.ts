import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  getSession,
  getVisiblePortfolioIdsForRole,
  requireWriteSession,
  scopeQuery,
  stampSpace,
} from '@/lib/auth';

// GET: 取得現金餘額
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    const visibleIds = await getVisiblePortfolioIdsForRole(session);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();

    let query = scopeQuery(supabase.from('cash_balance').select('*'), session);

    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    } else if (visibleIds !== null) {
      if (visibleIds.length === 0) {
        return NextResponse.json({ data: { amount_twd: 0 } });
      }
      query = query.in('portfolio_id', visibleIds);
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
    const auth = await requireWriteSession();
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const body = await request.json();
    const { amount_twd, portfolio_id } = body;

    if (typeof amount_twd !== 'number' || isNaN(amount_twd)) {
      return NextResponse.json({ error: '金額格式錯誤' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 有指定組合時，驗證歸屬（demo 帶真實/他人組合 id 會匹配 0 筆而被擋，避免跨 space 參照污染）
    if (portfolio_id) {
      const { data: owned } = await scopeQuery(
        supabase.from('portfolios').select('id').eq('id', portfolio_id),
        session
      ).maybeSingle();
      if (!owned) {
        return NextResponse.json({ error: '無效的投資組合' }, { status: 400 });
      }
    }

    // 先嘗試查詢現有記錄
    let query = scopeQuery(supabase.from('cash_balance').select('id'), session);
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
      result = await scopeQuery(
        supabase
          .from('cash_balance')
          .update({
            amount_twd,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingData.id),
        session
      )
        .select()
        .single();
    } else {
      // 新增記錄
      const insertData: { amount_twd: number; portfolio_id?: string; demo_space?: string } = {
        amount_twd,
        ...stampSpace(session),
      };
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
