import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  getSession,
  getVisiblePortfolioIdsForRole,
  requireWriteSession,
  scopeQuery,
} from '@/lib/auth';
import { addHolding, TradeError } from '@/lib/trades';
import type { Holding } from '@/types';

// GET: 取得指定投資組合的持股
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    // Why: 訪客只能讀取 visible_to_guest=true 的組合，否則可用 portfolio_id 直接撈出隱藏資料
    const visibleIds = await getVisiblePortfolioIdsForRole(session);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();

    let query = scopeQuery(
      supabase.from('holdings').select('*').gt('shares', 0),
      session
    ).order('created_at', { ascending: false });

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
    const auth = await requireWriteSession();
    if (!auth.ok) return auth.response;

    const data = await addHolding(auth.session, await request.json());
    return NextResponse.json({ data: data as Holding });
  } catch (err) {
    if (err instanceof TradeError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
