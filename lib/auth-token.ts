// Edge-safe 的 HMAC 簽章 token 模組
// 故意不依賴 next/headers 或 node:crypto，因為 middleware 在 Edge runtime 執行
//
// Token 格式：
//   admin/guest：<role>.<expiry>.<base64url(HMAC-SHA256)>
//   demo：      demo.<space>.<expiry>.<base64url(HMAC-SHA256)>
// Why: 舊版 cookie 值為純文字 role，攻擊者可手動設 cookie 繞過登入。
//      簽章後即使知道格式也無法偽造——缺少 AUTH_SECRET 就算不出正確簽章。
//      demo 的 space 也納入簽章負載，否則可改 cookie 竄入他人沙盒。

export type UserRole = 'admin' | 'guest' | 'demo';

export interface Session {
  role: UserRole;
  demoSpace: string | null; // 僅 demo 角色為非 null
}

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // admin/guest：7 天
const DEMO_MAX_AGE_SECONDS = 60 * 60 * 24; // demo：24 小時

export const AUTH_COOKIE_NAME = 'portfolio_auth';
export { COOKIE_MAX_AGE_SECONDS, DEMO_MAX_AGE_SECONDS };

// demo 沙盒壽命與 cookie 壽命必須一致，否則 cookie 還有效但資料已被清理 → 空站
export function maxAgeForRole(role: UserRole): number {
  return role === 'demo' ? DEMO_MAX_AGE_SECONDS : COOKIE_MAX_AGE_SECONDS;
}

// space 為 crypto.randomUUID() 產生；限定字元集確保不含 '.' 而破壞 token 分段
const DEMO_SPACE_RE = /^[0-9a-f-]{36}$/;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET 環境變數未設定或長度不足 32 字元，請執行 `openssl rand -hex 32` 產生後加入 .env.local'
    );
  }
  return secret;
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64urlEncode(new Uint8Array(sig));
}

// 定時間比對，避免時序攻擊
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createAuthToken(
  role: UserRole,
  demoSpace?: string | null
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeForRole(role);

  if (role === 'demo') {
    if (!demoSpace || !DEMO_SPACE_RE.test(demoSpace)) {
      throw new Error('demo token 需要合法的 demoSpace');
    }
    const payload = `demo.${demoSpace}.${exp}`;
    return `${payload}.${await hmacSign(payload)}`;
  }

  const payload = `${role}.${exp}`;
  return `${payload}.${await hmacSign(payload)}`;
}

export async function verifyAuthToken(
  token: string | undefined | null
): Promise<Session | null> {
  if (!token) return null;

  const parts = token.split('.');

  // demo：demo.<space>.<exp>.<sig>
  if (parts.length === 4) {
    const [role, space, expStr, sig] = parts;
    if (role !== 'demo' || !DEMO_SPACE_RE.test(space)) return null;
    if (!isUnexpired(expStr)) return null;

    const expected = await hmacSign(`demo.${space}.${expStr}`);
    if (!timingSafeEqual(sig, expected)) return null;

    return { role: 'demo', demoSpace: space };
  }

  // admin/guest：<role>.<exp>.<sig>
  if (parts.length === 3) {
    const [role, expStr, sig] = parts;
    if (role !== 'admin' && role !== 'guest') return null;
    if (!isUnexpired(expStr)) return null;

    const expected = await hmacSign(`${role}.${expStr}`);
    if (!timingSafeEqual(sig, expected)) return null;

    return { role, demoSpace: null };
  }

  return null;
}

function isUnexpired(expStr: string): boolean {
  const exp = Number(expStr);
  return Number.isFinite(exp) && exp >= Math.floor(Date.now() / 1000);
}
