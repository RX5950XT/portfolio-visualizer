import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserRole, getVisiblePortfolioIdsForRole } from '@/lib/auth';
import type { Holding } from '@/types';

// 權限檢查輔助函式
async function requireAdmin() {
  const role = await getUserRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: '無權限執行此操作' }, { status: 403 });
  }
  return null;
}

// GET: 取得指定投資組合的持股
export async function GET(request: Request) {
  try {
    const role = await getUserRole();
    if (!role) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    // Why: 訪客只能讀取 visible_to_guest=true 的組合，否則可用 portfolio_id 直接撈出隱藏資料
    const visibleIds = await getVisiblePortfolioIdsForRole(role);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();

    let query = supabase
      .from('holdings')
      .select('*')
      .order('created_at', { ascending: false });

    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    } else if (visibleIds !== null) {
      // 訪客無指定組合時，限縮到可見組合
      if (visibleIds.length === 0) {
        return NextResponse.json({ data: [] as Holding[] });
      }
      query = query.in('portfolio_id', visibleIds);
    }

    const { data, error } = await query;

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
    // 權限檢查：只有管理員可以新增持股
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const body = await request.json();
    const { symbol, shares, cost_price, purchase_date, portfolio_id } = body;

    // 驗證必填欄位
    if (!symbol || !shares || !cost_price || !purchase_date) {
      return NextResponse.json({ error: '請填寫所有必填欄位' }, { status: 400 });
    }

    // 判斷市場（台股或美股）
    const upperSymbol = symbol.toUpperCase();
    const market = upperSymbol.includes('.TW') ? 'TW' : 'US';

    const supabase = createServerClient();

    const insertData: {
      symbol: string;
      shares: number;
      cost_price: number;
      purchase_date: string;
      market: string;
      portfolio_id?: string;
    } = {
      symbol: upperSymbol,
      shares: parseFloat(shares),
      cost_price: parseFloat(cost_price),
      purchase_date,
      market,
    };

    // 如果有指定投資組合，加入 portfolio_id
    if (portfolio_id) {
      insertData.portfolio_id = portfolio_id;
    }

    const { data, error } = await supabase
      .from('holdings')
      .insert(insertData)
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
