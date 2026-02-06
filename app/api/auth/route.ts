import { NextResponse } from 'next/server';
import { verifyPassword, setAuthCookie, clearAuthCookie } from '@/lib/auth';

// POST: 登入
export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    
    if (!password) {
      return NextResponse.json({ error: '請輸入密碼' }, { status: 400 });
    }
    
    if (!verifyPassword(password)) {
      return NextResponse.json({ error: '密碼錯誤' }, { status: 401 });
    }
    
    await setAuthCookie();
    return NextResponse.json({ data: { success: true } });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// DELETE: 登出
export async function DELETE() {
  try {
    await clearAuthCookie();
    return NextResponse.json({ data: { success: true } });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
