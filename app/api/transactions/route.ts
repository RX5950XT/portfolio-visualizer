import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  getSession,
  getVisiblePortfolioIdsForRole,
  requireWriteSession,
  scopeQuery,
} from '@/lib/auth';
import { sellLots, TradeError } from '@/lib/trades';

// GET: 取得交易歷史
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

    let query = scopeQuery(supabase.from('transactions').select('*'), session)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    } else if (visibleIds !== null) {
      if (visibleIds.length === 0) {
        return NextResponse.json({ data: [] });
      }
      query = query.in('portfolio_id', visibleIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error('取得交易紀錄失敗:', error);
      return NextResponse.json({ error: '取得交易紀錄失敗' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// POST: 賣出股票（流程見 lib/trades.ts sellLots）
export async function POST(request: Request) {
  try {
    const auth = await requireWriteSession();
    if (!auth.ok) return auth.response;

    const data = await sellLots(auth.session, await request.json());
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof TradeError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('賣出操作失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
