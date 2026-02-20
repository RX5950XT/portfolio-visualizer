import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserRole } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 權限檢查輔助函式
async function requireAdmin() {
  const role = await getUserRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: '無權限執行此操作' }, { status: 403 });
  }
  return null;
}

// GET: 取得單一投資組合
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', id)
      .single();

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
    // 權限檢查：只有管理員可以更新投資組合
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

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

    const { data, error } = await supabase
      .from('portfolios')
      .update(updateData)
      .eq('id', id)
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
    // 權限檢查：只有管理員可以刪除投資組合
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const { id } = await params;
    const supabase = createServerClient();

    // 先刪除該組合下的所有持股
    await supabase.from('holdings').delete().eq('portfolio_id', id);

    // 刪除該組合的現金餘額
    await supabase.from('cash_balance').delete().eq('portfolio_id', id);

    // 刪除投資組合本身
    const { error } = await supabase
      .from('portfolios')
      .delete()
      .eq('id', id);

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
