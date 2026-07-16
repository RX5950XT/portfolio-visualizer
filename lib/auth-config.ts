import {
  randomBytes,
  scryptSync,
  timingSafeEqual as nodeTimingSafeEqual,
} from 'node:crypto';
import { createServerClient } from '@/lib/supabase';

// 密碼雜湊存 app_settings；此檔用 node:crypto，絕不可被 middleware import
export interface PasswordHash {
  salt: string;
  hash: string;
}

export interface AuthConfig {
  admin: PasswordHash | null; // null = 未設定 → 走 env 首次引導
  guest: PasswordHash | null;
  demoEnabled: boolean;
}

const SETTINGS_KEY = 'auth_config';

// 公開展示密碼，刻意寫死；首頁提示才能永遠正確
export const DEMO_PASSWORD = 'demo';
export const MIN_PASSWORD_LENGTH = 8;

const DEFAULTS: AuthConfig = {
  admin: null,
  guest: null,
  demoEnabled: true,
};

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

  const stored = (data?.value ?? {}) as Partial<AuthConfig>;
  return {
    admin: isPasswordHash(stored.admin) ? stored.admin : null,
    guest: isPasswordHash(stored.guest) ? stored.guest : null,
    demoEnabled:
      typeof stored.demoEnabled === 'boolean'
        ? stored.demoEnabled
        : DEFAULTS.demoEnabled,
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
