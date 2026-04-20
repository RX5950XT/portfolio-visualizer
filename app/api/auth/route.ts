import { NextResponse } from 'next/server';
import { verifyPassword, setAuthCookie, clearAuthCookie } from '@/lib/auth';

// Why: Serverless 環境無法共享狀態，這裡加固定延遲讓每次嘗試至少耗費數百毫秒，
//      即可阻擋 HTTP 層次的快速暴力破解。真正的 rate limit 建議靠前端（Vercel）邊界。
const FAILED_LOGIN_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST: 登入
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const password = body && typeof body.password === 'string' ? body.password : '';

    if (!password) {
      await sleep(FAILED_LOGIN_DELAY_MS);
      return NextResponse.json({ error: '請輸入密碼' }, { status: 400 });
    }

    const role = verifyPassword(password);

    if (!role) {
      await sleep(FAILED_LOGIN_DELAY_MS);
      return NextResponse.json({ error: '密碼錯誤' }, { status: 401 });
    }

    await setAuthCookie(role);
    return NextResponse.json({ data: { success: true, role } });
  } catch (err) {
    console.error('登入錯誤:', err);
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
