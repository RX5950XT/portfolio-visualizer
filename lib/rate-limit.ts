import { createHmac } from 'node:crypto';
import { getSecret } from '@/lib/auth-token';
import { createServerClient } from '@/lib/supabase';

interface RateRule {
  key: string;
  limit: number;
  windowSeconds: number;
}

const LOGIN_WINDOW_SECONDS = 15 * 60;
const DEMO_WINDOW_SECONDS = 60 * 60;

// Why: 資料庫不留原始 IP 與帳號；HMAC 而非純雜湊，因為 IP 的可能值少，純雜湊可被窮舉還原。
function bucket(scope: string, subject: string): string {
  return `${scope}:${createHmac('sha256', getSecret()).update(subject).digest('hex')}`;
}

// Vercel 會覆寫 x-forwarded-for，外部無法偽造；本機沒有這個標頭時全部算同一個來源。
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

// 三層上限各防一種猜法：
// - 同來源猜同一帳號：擋一般暴力破解，登入成功會歸零，是使用者實際會碰到的上限。
// - 同來源猜多個帳號：擋拿一組常見密碼掃所有帳號。
// - 同帳號的全部來源：擋分散式猜測；門檻刻意遠高於前者，避免別人輕易把帳號鎖住。
export function loginRules(ip: string, username: string) {
  const perAccountAndIp: RateRule = {
    key: bucket('login-ip-user', `${ip}|${username}`), limit: 10, windowSeconds: LOGIN_WINDOW_SECONDS,
  };
  return {
    perAccountAndIp,
    all: [
      perAccountAndIp,
      { key: bucket('login-ip', ip), limit: 30, windowSeconds: LOGIN_WINDOW_SECONDS },
      { key: bucket('login-user', username), limit: 100, windowSeconds: LOGIN_WINDOW_SECONDS },
    ],
  };
}

// 全站上限防分散式灌資料；每次進入都會寫入一個新沙盒。
export function demoRules(ip: string): RateRule[] {
  return [
    { key: bucket('demo-ip', ip), limit: 10, windowSeconds: DEMO_WINDOW_SECONDS },
    { key: 'demo-global', limit: 300, windowSeconds: DEMO_WINDOW_SECONDS },
  ];
}

// 回傳 0 = 放行；大於 0 = 要再等幾秒。查詢失敗會拋出：寧可暫時不能登入，也不放行無限次猜測。
export async function consumeRateLimit(rules: RateRule[]): Promise<number> {
  const supabase = createServerClient();
  const results = await Promise.all(
    rules.map(async ({ key, limit, windowSeconds }) => {
      const { data, error } = await supabase.rpc('auth_rate_limit_hit', {
        p_key: key, p_limit: limit, p_window_seconds: windowSeconds,
      });
      if (error) throw new Error(`檢查次數限制失敗: ${error.message}`);
      return Number(data);
    })
  );
  return Math.max(...results);
}

export async function clearRateLimit(rule: RateRule): Promise<void> {
  const { error } = await createServerClient().from('auth_rate_limits').delete().eq('key', rule.key);
  // 登入本身已成功，歸零失敗只影響下次的剩餘次數，不該讓這次登入失敗。
  if (error) console.error('清除登入次數失敗:', error);
}
