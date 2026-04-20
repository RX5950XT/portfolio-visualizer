import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import {
  AUTH_COOKIE_NAME,
  COOKIE_MAX_AGE_SECONDS,
  createAuthToken,
  timingSafeEqual,
  verifyAuthToken,
  type UserRole,
} from '@/lib/auth-token';

export type { UserRole };

// 驗證密碼並回傳角色
// Why: 使用定時間比對避免時序攻擊；雖在 Node.js 實務上利用機率低，但成本極低值得加
export function verifyPassword(password: string): UserRole | null {
  if (typeof password !== 'string' || password.length === 0) return null;

  const adminPassword = process.env.SITE_PASSWORD;
  const guestPassword = process.env.GUEST_PASSWORD;

  if (!adminPassword) {
    console.warn('SITE_PASSWORD 環境變數未設定');
    return null;
  }

  if (timingSafeEqual(password, adminPassword)) return 'admin';
  if (guestPassword && timingSafeEqual(password, guestPassword)) return 'guest';

  return null;
}

// 設定認證 Cookie（HMAC 簽章 token）
export async function setAuthCookie(role: UserRole): Promise<void> {
  const token = await createAuthToken(role);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });
}

// 清除認證 Cookie
export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

// 取得當前用戶角色（驗證簽章）
export async function getUserRole(): Promise<UserRole | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  return verifyAuthToken(token);
}

export async function isAuthenticated(): Promise<boolean> {
  const role = await getUserRole();
  return role !== null;
}

// 取得「對訪客可見」的投資組合 ID 清單
// Why: 訪客模式下，holdings/transactions/cash/charts 等 API 必須以此過濾，
//      避免訪客直接用 portfolio_id 讀取隱藏組合的資料
// 回傳值：
//   - admin：null（代表不過濾，全部可見）
//   - guest：string[] 可見組合 UUID
export async function getVisiblePortfolioIdsForRole(
  role: UserRole
): Promise<string[] | null> {
  if (role === 'admin') return null;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('portfolios')
    .select('id')
    .eq('visible_to_guest', true);

  if (error) {
    console.error('取得訪客可見組合失敗:', error);
    return [];
  }

  return (data ?? []).map((p: { id: string }) => p.id);
}
