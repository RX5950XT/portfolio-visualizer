import { NextResponse } from 'next/server';
import { getUserRole } from '@/lib/auth';

// GET: 取得當前用戶角色
export async function GET() {
  try {
    const role = await getUserRole();

    if (!role) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    return NextResponse.json({ data: { role } });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
