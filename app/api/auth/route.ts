import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { verifyCredentials, setAuthCookie, clearAuthCookie } from '@/lib/auth';
import { getAuthConfig, normalizeUsername } from '@/lib/auth-config';
import { seedDemoSpace, sweepExpiredDemo } from '@/lib/demo-seed';
import { clearRateLimit, clientIp, consumeRateLimit, demoRules, loginRules } from '@/lib/rate-limit';

// 次數上限在 lib/rate-limit.ts；這個延遲只是再拖慢單次嘗試，併發時擋不住猜測。
const FAILED_LOGIN_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tooManyAttempts(retryAfterSeconds: number): NextResponse {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return NextResponse.json(
    { error: `嘗試次數過多，請約 ${minutes} 分鐘後再試` },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

// demo：免帳密，每次登入配一個全新沙盒，並順手清掉過期的舊沙盒
async function loginDemo(request: Request): Promise<NextResponse> {
  const config = await getAuthConfig();
  if (!config.demoEnabled) {
    return NextResponse.json({ error: 'Demo 模式未開放' }, { status: 403 });
  }
  const retryAfter = await consumeRateLimit(demoRules(clientIp(request)));
  if (retryAfter > 0) return tooManyAttempts(retryAfter);
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
    if (body?.demo === true) return await loginDemo(request);

    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username || !password) {
      await sleep(FAILED_LOGIN_DELAY_MS);
      return NextResponse.json({ error: '請輸入帳號與密碼' }, { status: 400 });
    }

    // 先計數再驗密碼：併發猜測才會在驗證前就被擋下，也省下 scrypt 的運算
    const rules = loginRules(clientIp(request), normalizeUsername(username));
    const retryAfter = await consumeRateLimit(rules.all);
    if (retryAfter > 0) return tooManyAttempts(retryAfter);

    const credential = await verifyCredentials(username, password);

    if (!credential) {
      await sleep(FAILED_LOGIN_DELAY_MS);
      return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
    }

    await clearRateLimit(rules.perAccountAndIp);
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
