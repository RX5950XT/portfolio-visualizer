import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET: 取得所有投資組合
export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      // 如果表格不存在，回傳預設組合
      if (error.code === '42P01') {
        return NextResponse.json({
          data: [{ id: 'default', name: '新的投資組合', is_default: true }],
        });
      }
      console.error('取得投資組合失敗:', error);
      return NextResponse.json({ error: '取得投資組合失敗' }, { status: 500 });
    }

    // 如果沒有任何組合，回傳預設
    if (!data || data.length === 0) {
      return NextResponse.json({
        data: [{ id: 'default', name: '新的投資組合', is_default: true }],
      });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('取得投資組合錯誤:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// POST: 建立新投資組合
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: '請提供組合名稱' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('portfolios')
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) {
      console.error('建立投資組合失敗:', error);
      return NextResponse.json({ error: '建立投資組合失敗' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('建立投資組合錯誤:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
