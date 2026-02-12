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
