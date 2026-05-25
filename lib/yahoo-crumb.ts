// Yahoo Finance quoteSummary（v10）自 2024 起需 crumb + cookie，否則回 401 Invalid Crumb。
// 此模組取得並快取 cookie/crumb，並提供帶認證的 quoteSummary 取用；chart（v8）端點不受影響。

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const TTL = 30 * 60 * 1000; // crumb 快取 30 分鐘
const FAIL_TTL = 5 * 60 * 1000; // 取 crumb 失敗後冷卻，避免每次都重打

// Yahoo 取 cookie 來源；fc.yahoo.com 已停用，保留多個來源以兼容不同部署環境
const COOKIE_SOURCES = ['https://finance.yahoo.com', 'https://fc.yahoo.com'];

let cache: { cookie: string; crumb: string; ts: number } | null = null;
let failedAt = 0;

async function refresh(): Promise<{ cookie: string; crumb: string } | null> {
  for (const src of COOKIE_SOURCES) {
    try {
      const r = await fetch(src, { headers: { 'User-Agent': UA } });
      const setCookies = r.headers.getSetCookie?.() ?? [];
      const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
      if (!cookie) continue;

      const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': UA, Cookie: cookie },
      });
      if (!cr.ok) continue;
      const crumb = (await cr.text()).trim();
      if (!crumb || crumb.includes('<')) continue;

      cache = { cookie, crumb, ts: Date.now() };
      return cache;
    } catch {
      // 換下一個來源（finance.yahoo.com 在部分 Node 環境會 headers overflow）
    }
  }
  failedAt = Date.now();
  return null;
}

async function getCreds() {
  if (cache && Date.now() - cache.ts < TTL) return cache;
  if (Date.now() - failedAt < FAIL_TTL) return null; // 冷卻期內不重試
  return refresh();
}

// 取得 quoteSummary 指定 modules 的 result[0]；失敗回 null，crumb 失效時自動重取一次
export async function fetchQuoteSummary(
  symbol: string,
  modules: string,
  revalidate = 86400
): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const creds = await getCreds();
    if (!creds) return null;

    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      symbol
    )}?modules=${modules}&crumb=${encodeURIComponent(creds.crumb)}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Cookie: creds.cookie },
      next: { revalidate },
    });

    if (res.status === 401) {
      cache = null; // crumb 失效，重取後再試一次
      continue;
    }
    if (!res.ok) return null;

    const json = await res.json();
    return json?.quoteSummary?.result?.[0] ?? null;
  }
  return null;
}
