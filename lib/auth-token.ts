// Edge-safe 的 HMAC 簽章 token 模組
// 故意不依賴 next/headers 或 node:crypto，因為 middleware 在 Edge runtime 執行
//
// Token 格式：<role>.<expiry>.<base64url(HMAC-SHA256)>
// Why: 舊版 cookie 值為純文字 role，攻擊者可手動設 cookie 繞過登入。
//      簽章後即使知道格式也無法偽造——缺少 AUTH_SECRET 就算不出正確簽章。

export type UserRole = 'admin' | 'guest';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 天

export const AUTH_COOKIE_NAME = 'portfolio_auth';
export { COOKIE_MAX_AGE_SECONDS };

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

export async function createAuthToken(role: UserRole): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS;
  const payload = `${role}.${exp}`;
  const sig = await hmacSign(payload);
  return `${payload}.${sig}`;
}

export async function verifyAuthToken(
  token: string | undefined | null
): Promise<UserRole | null> {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [role, expStr, sig] = parts;
  if (role !== 'admin' && role !== 'guest') return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  const expected = await hmacSign(`${role}.${expStr}`);
  if (!timingSafeEqual(sig, expected)) return null;

  return role;
}
