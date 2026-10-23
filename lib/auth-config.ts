import {
  randomBytes,
  scryptSync,
  timingSafeEqual as nodeTimingSafeEqual,
} from 'node:crypto';
import { createServerClient } from '@/lib/supabase';

// 帳號與密碼雜湊存 app_settings；此檔用 node:crypto，絕不可被 middleware import
export interface PasswordHash {
  salt: string;
  hash: string;
}

export interface AdminAccount {
  username: string;
  password: PasswordHash;
}

export interface GuestAccount {
  id: string;
  username: string;
  password: PasswordHash;
  portfolioIds: string[]; // 此訪客可看的組合；新組合預設不開放
}

// Why: 欄位刻意不沿用舊版 admin/guest 鍵名，舊版部署讀到新資料也不會誤解析
export interface AuthConfig {
  adminAccount: AdminAccount | null; // null = 未設定 → 走 env 首次引導
  guestAccounts: GuestAccount[];
  demoEnabled: boolean;
}

const SETTINGS_KEY = 'auth_config';

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const ID_RE = /^[0-9a-f-]{36}$/;

// 帳號不分大小寫，一律以小寫儲存與比對
export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

function isPasswordHash(value: unknown): value is PasswordHash {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.salt === 'string' &&
    typeof v.hash === 'string' &&
    v.salt.length > 0 &&
    v.hash.length > 0
  );
}

function parseAdmin(value: unknown): AdminAccount | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.username !== 'string' || !isPasswordHash(v.password)) return null;
  return { username: v.username, password: v.password };
}

function parseGuest(value: unknown): GuestAccount | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'string' ||
    !ID_RE.test(v.id) ||
    typeof v.username !== 'string' ||
    !isPasswordHash(v.password) ||
    !Array.isArray(v.portfolioIds)
  ) {
    return null;
  }
  return {
    id: v.id,
    username: v.username,
    password: v.password,
    portfolioIds: v.portfolioIds.filter((p): p is string => typeof p === 'string'),
  };
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    console.error('讀取認證設定失敗:', error);
  }

  const stored = (data?.value ?? {}) as Record<string, unknown>;
  const guests = Array.isArray(stored.guestAccounts) ? stored.guestAccounts : [];
  return {
    adminAccount: parseAdmin(stored.adminAccount),
    guestAccounts: guests
      .map(parseGuest)
      .filter((g): g is GuestAccount => g !== null),
    demoEnabled:
      typeof stored.demoEnabled === 'boolean' ? stored.demoEnabled : true,
  };
}

export async function saveAuthConfig(config: AuthConfig): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from('app_settings').upsert({
    key: SETTINGS_KEY,
    value: config,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`儲存認證設定失敗: ${error.message}`);
  }
}

// 帳號在管理員與所有訪客間必須唯一；exceptGuestId 用於編輯自己時排除
export function isUsernameTaken(
  config: AuthConfig,
  username: string,
  exceptGuestId?: string
): boolean {
  if (config.adminAccount?.username === username) return true;
  if (!config.adminAccount && username === bootstrapAdminUsername()) return true;
  return config.guestAccounts.some(
    (g) => g.username === username && g.id !== exceptGuestId
  );
}

export function bootstrapAdminUsername(): string {
  return normalizeUsername(process.env.SITE_USERNAME) || 'admin';
}

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPasswordHash(
  password: string,
  stored: PasswordHash
): boolean {
  try {
    const computed = scryptSync(password, stored.salt, 64);
    const expected = Buffer.from(stored.hash, 'hex');
    if (computed.length !== expected.length) return false;
    return nodeTimingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

// 只保留真實存在的真實組合 id；格式不符直接拒絕，避免 uuid cast 錯誤
export async function resolvePortfolioIds(raw: unknown): Promise<string[] | null> {
  if (!Array.isArray(raw)) return null;
  const ids = [...new Set(raw)];
  if (!ids.every((id): id is string => typeof id === 'string' && ID_RE.test(id))) {
    return null;
  }
  if (ids.length === 0) return [];

  const { data, error } = await createServerClient()
    .from('portfolios')
    .select('id')
    .in('id', ids)
    .is('demo_space', null);
  if (error) throw new Error(`驗證投資組合失敗: ${error.message}`);
  return (data ?? []).map((p: { id: string }) => p.id);
}
