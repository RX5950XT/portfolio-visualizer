import { cookies } from 'next/headers';

const AUTH_COOKIE_NAME = 'portfolio_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

// 驗證密碼
export function verifyPassword(password: string): boolean {
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) {
    console.warn('SITE_PASSWORD 環境變數未設定');
    return false;
  }
  return password === sitePassword;
}

// 設定認證 Cookie
export async function setAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

// 清除認證 Cookie
export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

// 檢查是否已認證
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  return authCookie?.value === 'authenticated';
}
