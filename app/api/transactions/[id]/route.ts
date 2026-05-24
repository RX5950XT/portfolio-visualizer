import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserRole } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function requireAdmin() {
  const role = await getUserRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: '無權限執行此操作' }, { status: 403 });
  }
  return null;
}

// PATCH: 僅允許更新備註（改 shares/price/pnl 會破壞會計，故不開放）
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    if (!('notes' in body)) {
      return NextResponse.json({ error: '缺少 notes 欄位' }, { status: 400 });
    }
    const notes = body.notes;
    if (notes !== null && typeof notes !== 'string') {
      return NextResponse.json({ error: 'notes 格式錯誤' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { error } = await supabase
      .from('transactions')
      .update({ notes: notes || null })
      .eq('id', id);

    if (error) {
      console.error('更新交易備註失敗:', error);
      return NextResponse.json({ error: '更新交易備註失敗' }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true } });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// DELETE: 刪除交易紀錄
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const { id } = await params;
    const supabase = createServerClient();

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('刪除交易紀錄失敗:', error);
      return NextResponse.json({ error: '刪除交易紀錄失敗' }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true } });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
