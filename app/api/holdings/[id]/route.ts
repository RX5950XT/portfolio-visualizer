import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireWriteSession, scopeQuery } from '@/lib/auth';
import { TradeError, updateHolding } from '@/lib/trades';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PUT: 更新持股（邏輯見 lib/trades.ts updateHolding，與 MCP 共用）
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireWriteSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const data = await updateHolding(auth.session, id, await request.json());
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof TradeError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// DELETE: 刪除持股
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireWriteSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const supabase = createServerClient();

    const { error } = await scopeQuery(
      supabase.from('holdings').delete().eq('id', id),
      auth.session
    );

    if (error) {
      console.error('刪除持股失敗:', error);
      return NextResponse.json({ error: '刪除持股失敗' }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true } });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
