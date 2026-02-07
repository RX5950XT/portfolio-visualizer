import { cookies } from 'next/headers';

const AUTH_COOKIE_NAME = 'portfolio_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

// 用戶角色類型
export type UserRole = 'admin' | 'guest';

// 驗證密碼並回傳角色
export function verifyPassword(password: string): UserRole | null {
  const adminPassword = process.env.SITE_PASSWORD;
  const guestPassword = process.env.GUEST_PASSWORD;

  if (!adminPassword) {
    console.warn('SITE_PASSWORD 環境變數未設定');
    return null;
  }

  if (password === adminPassword) {
    return 'admin';
  }

  if (guestPassword && password === guestPassword) {
    return 'guest';
  }

  return null;
}

// 設定認證 Cookie（包含角色資訊）
export async function setAuthCookie(role: UserRole): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, role, {
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

// 取得當前用戶角色
export async function getUserRole(): Promise<UserRole | null> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  const value = authCookie?.value;

  if (value === 'admin' || value === 'guest') {
    return value;
  }

  // 相容舊版 'authenticated' cookie（視為管理員）
  if (value === 'authenticated') {
    return 'admin';
  }

  return null;
}

// 檢查是否已認證
export async function isAuthenticated(): Promise<boolean> {
  const role = await getUserRole();
  return role !== null;
}
