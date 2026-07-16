import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  getSession,
  getVisiblePortfolioIdsForRole,
  requireWriteSession,
  scopeQuery,
} from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: 取得單一投資組合
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    const { id } = await params;

    const visibleIds = await getVisiblePortfolioIdsForRole(session);
    if (visibleIds !== null && !visibleIds.includes(id)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();

    // 跨沙盒的 id 會匹配 0 筆 → single() 報錯 → 404
    const { data, error } = await scopeQuery(
      supabase.from('portfolios').select('*').eq('id', id),
      session
    ).single();

    if (error) {
      console.error('取得投資組合失敗:', error);
      return NextResponse.json({ error: '找不到投資組合' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('取得投資組合錯誤:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// PUT: 更新投資組合（重命名 / 切換訪客可見性）
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireWriteSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, visible_to_guest } = body;

    // 至少要提供一個可更新的欄位
    const updateData: Record<string, unknown> = {};
    if (typeof name === 'string' && name.trim()) {
      updateData.name = name.trim();
    }
    if (typeof visible_to_guest === 'boolean') {
      updateData.visible_to_guest = visible_to_guest;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '請提供要更新的欄位' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data, error } = await scopeQuery(
      supabase.from('portfolios').update(updateData).eq('id', id),
      auth.session
    )
      .select()
      .single();

    if (error) {
      console.error('更新投資組合失敗:', error);
      return NextResponse.json({ error: '更新投資組合失敗' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('更新投資組合錯誤:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// DELETE: 刪除投資組合（同時刪除該組合下的所有持股和現金）
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireWriteSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const supabase = createServerClient();

    // 三個 delete 都必須套 scopeQuery：只擋最後一個的話，
    // demo 傳真實組合 id 仍會刪掉 admin 的持股與現金。
    await scopeQuery(supabase.from('holdings').delete().eq('portfolio_id', id), auth.session);
    await scopeQuery(
      supabase.from('cash_balance').delete().eq('portfolio_id', id),
      auth.session
    );

    const { error } = await scopeQuery(
      supabase.from('portfolios').delete().eq('id', id),
      auth.session
    );

    if (error) {
      console.error('刪除投資組合失敗:', error);
      return NextResponse.json({ error: '刪除投資組合失敗' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('刪除投資組合錯誤:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
