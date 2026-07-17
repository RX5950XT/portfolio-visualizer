import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import {
  DEMO_PASSWORD,
  MIN_PASSWORD_LENGTH,
  getAuthConfig,
  verifyPasswordHash,
} from '@/lib/auth-config';
import {
  AUTH_COOKIE_NAME,
  createAuthToken,
  maxAgeForRole,
  timingSafeEqual,
  verifyAuthToken,
  type Session,
  type UserRole,
} from '@/lib/auth-token';

export type { UserRole, Session };

// 驗證密碼並回傳角色
// Why: DB 有雜湊以 DB 為準；null 才回退 env（首次引導）。demo 為公開常數 + 開關。
export async function verifyPassword(
  password: string
): Promise<UserRole | null> {
  if (typeof password !== 'string' || password.length === 0) return null;

  const config = await getAuthConfig();

  if (config.admin) {
    if (verifyPasswordHash(password, config.admin)) return 'admin';
  } else {
    const adminPassword = process.env.SITE_PASSWORD;
    if (!adminPassword) {
      console.warn(
        'SITE_PASSWORD 環境變數未設定，且資料庫尚未設定管理員密碼'
      );
    } else if (adminPassword.length < MIN_PASSWORD_LENGTH) {
      // 引導密碼過短即拒用，避免弱密碼長期把守 admin 入口
      console.warn(
        `SITE_PASSWORD 長度不足 ${MIN_PASSWORD_LENGTH} 字元，已忽略；請於 /settings 設定更強的密碼`
      );
    } else if (timingSafeEqual(password, adminPassword)) {
      return 'admin';
    }
  }

  if (config.guest) {
    if (verifyPasswordHash(password, config.guest)) return 'guest';
  } else {
    const guestPassword = process.env.GUEST_PASSWORD;
    if (guestPassword && timingSafeEqual(password, guestPassword)) {
      return 'guest';
    }
  }

  if (config.demoEnabled && timingSafeEqual(password, DEMO_PASSWORD)) {
    return 'demo';
  }

  return null;
}

// 設定認證 Cookie（HMAC 簽章 token）
export async function setAuthCookie(
  role: UserRole,
  demoSpace?: string | null
): Promise<void> {
  const token = await createAuthToken(role, demoSpace);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // demo cookie 只活 24h，與沙盒清理週期一致
    maxAge: maxAgeForRole(role),
    path: '/',
  });
}

// 清除認證 Cookie
export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

// 取得當前 session（驗證簽章）
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  return verifyAuthToken(token);
}

// 取得當前用戶角色（驗證簽章）
export async function getUserRole(): Promise<UserRole | null> {
  const session = await getSession();
  return session?.role ?? null;
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}

// --- Demo 沙盒隔離 ---
//
// 隔離契約：admin/guest 只看真實資料（demo_space IS NULL）、demo 只看自己沙盒。
// 所有對 portfolios/holdings/cash_balance/transactions 的 SELECT/UPDATE/DELETE
// 都必須經過 scopeQuery，INSERT 都必須併入 stampSpace——這是隔離的唯一真相來源。

interface SpaceScopable {
  eq(column: string, value: string): SpaceScopable;
  is(column: string, value: null): SpaceScopable;
}

// 對 query 追加沙盒述詞。
// Why: [id] 寫入因此安全 by construction——demo 改到真實資料的 row 會匹配 0 筆而無效，
//      不需另外查歸屬；反之 admin 的述詞也永遠命中不了 demo 列。
//
// T 刻意不加約束：用 `T extends SpaceScopable<T>` 或 polymorphic `this` 約束時，
// TS 展開 PostgrestFilterBuilder 會觸發 TS2589（型別實例化過深）。
// 轉型收斂在此函式內部一處，呼叫端仍保有完整的 query builder 型別推論。
export function scopeQuery<T>(query: T, session: Session): T {
  const scopable = query as SpaceScopable;
  const scoped =
    session.demoSpace !== null
      ? scopable.eq('demo_space', session.demoSpace)
      : scopable.is('demo_space', null);
  return scoped as T;
}

// INSERT 時標記所屬沙盒；admin/guest 留 NULL（真實資料）
export function stampSpace(session: Session): { demo_space?: string } {
  return session.demoSpace !== null ? { demo_space: session.demoSpace } : {};
}

type WriteAuth =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

// 寫入權限：admin 寫真實資料、demo 寫自己沙盒；guest 唯讀
export async function requireWriteSession(): Promise<WriteAuth> {
  const session = await getSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: '未授權' }, { status: 401 }) };
  }
  if (session.role === 'guest') {
    return {
      ok: false,
      response: NextResponse.json({ error: '無權限執行此操作' }, { status: 403 }),
    };
  }
  return { ok: true, session };
}

// 取得「對當前 session 可見」的投資組合 ID 清單
// Why: 訪客模式下，holdings/transactions/cash/charts 等 API 必須以此過濾，
//      避免訪客直接用 portfolio_id 讀取隱藏組合的資料
// 回傳值：
//   - admin：null（不靠 id 清單，由 scopeQuery 排除 demo 列）
//   - demo： null（同上，沙盒邊界由 scopeQuery 的 demo_space 述詞保證）
//   - guest：string[] 可見組合 UUID
export async function getVisiblePortfolioIdsForRole(
  session: Session
): Promise<string[] | null> {
  if (session.role !== 'guest') return null;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('portfolios')
    .select('id')
    .eq('visible_to_guest', true)
    // demo 建立的組合 visible_to_guest 預設為 TRUE，不排除會汙染訪客可見清單
    .is('demo_space', null);

  if (error) {
    console.error('取得訪客可見組合失敗:', error);
    return [];
  }

  return (data ?? []).map((p: { id: string }) => p.id);
}
