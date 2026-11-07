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
  sessionsValidAfter?: number; // 秒；比這更早簽發的 token 視為已撤銷（改密碼時更新）
}

export interface GuestAccount {
  id: string;
  username: string;
  password: PasswordHash;
  portfolioIds: string[]; // 此訪客可看的組合；新組合預設不開放
  sessionsValidAfter?: number; // 同 AdminAccount
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

function parseValidAfter(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseAdmin(value: unknown): AdminAccount | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.username !== 'string' || !isPasswordHash(v.password)) return null;
  return { username: v.username, password: v.password, sessionsValidAfter: parseValidAfter(v.sessionsValidAfter) };
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
    sessionsValidAfter: parseValidAfter(v.sessionsValidAfter),
  };
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  // Why: 讀不到不等於沒有帳號。當成空設定會讓舊 env 密碼復活、Demo 被打開，
  //      接著任何存檔都會把真實帳號蓋掉，所以一律拋出，只有「列真的不存在」才算首次引導。
  if (error) {
    throw new Error(`讀取認證設定失敗: ${error.message}`);
  }

  const stored = (data?.value ?? {}) as Record<string, unknown>;
  return {
    adminAccount: parseStoredAdmin(stored.adminAccount),
    guestAccounts: parseStoredGuests(stored.guestAccounts),
    demoEnabled:
      typeof stored.demoEnabled === 'boolean' ? stored.demoEnabled : true,
  };
}

// 格式壞掉同樣要拋出：靜默略過的帳號會在下次存檔時永久消失
function parseStoredAdmin(value: unknown): AdminAccount | null {
  if (value === undefined || value === null) return null;
  const admin = parseAdmin(value);
  if (!admin) throw new Error('認證設定的管理員帳號格式錯誤');
  return admin;
}

function parseStoredGuests(value: unknown): GuestAccount[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('認證設定的訪客清單格式錯誤');
  return value.map((item) => {
    const guest = parseGuest(item);
    if (!guest) throw new Error('認證設定的訪客帳號格式錯誤');
    return guest;
  });
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

// 帳號不存在時也跑一次 scrypt，否則回應快慢會洩漏帳號是否存在
const DUMMY_PASSWORD_HASH: PasswordHash = { salt: '0'.repeat(32), hash: '0'.repeat(128) };

export function burnPasswordCheck(password: string): void {
  verifyPasswordHash(password, DUMMY_PASSWORD_HASH);
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
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
