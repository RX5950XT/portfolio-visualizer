import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { verifyCredentials, setAuthCookie, clearAuthCookie } from '@/lib/auth';
import { getAuthConfig } from '@/lib/auth-config';
import { seedDemoSpace, sweepExpiredDemo } from '@/lib/demo-seed';

// Why: Serverless 環境無法共享狀態，這裡加固定延遲讓每次嘗試至少耗費數百毫秒，
//      即可阻擋 HTTP 層次的快速暴力破解。真正的 rate limit 建議靠前端（Vercel）邊界。
const FAILED_LOGIN_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// demo：免帳密，每次登入配一個全新沙盒，並順手清掉過期的舊沙盒
async function loginDemo(): Promise<NextResponse> {
  const config = await getAuthConfig();
  if (!config.demoEnabled) {
    return NextResponse.json({ error: 'Demo 模式未開放' }, { status: 403 });
  }
  await sweepExpiredDemo();
  const demoSpace = randomUUID();
  await seedDemoSpace(demoSpace);
  await setAuthCookie('demo', demoSpace);
  return NextResponse.json({ data: { success: true, role: 'demo' } });
}

// POST: 登入（{ username, password } 或 { demo: true }）
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (body?.demo === true) return await loginDemo();

    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username || !password) {
      await sleep(FAILED_LOGIN_DELAY_MS);
      return NextResponse.json({ error: '請輸入帳號與密碼' }, { status: 400 });
    }

    const credential = await verifyCredentials(username, password);

    if (!credential) {
      await sleep(FAILED_LOGIN_DELAY_MS);
      return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
    }

    await setAuthCookie(credential.role, credential.guestId);
    return NextResponse.json({ data: { success: true, role: credential.role } });
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
