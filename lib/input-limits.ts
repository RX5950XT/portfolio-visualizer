// 網站 API 與 MCP 共用的輸入上限。Demo 免登入，這些欄位若不設限，任何人都能灌爆資料庫。
export const MAX_PORTFOLIO_NAME_LENGTH = 100;
export const MAX_NOTES_LENGTH = 500;
export const MAX_LOTS_PER_SELL = 500;

const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 歷史圖表會逐日展開到買入日；不設下限，一個極早的日期就能讓每次請求跑上百萬圈。
const EARLIEST_DATE = '1970-01-01';

export function isValidSymbol(value: unknown): value is string {
  return typeof value === 'string' && SYMBOL_RE.test(value);
}

export function isValidNotes(value: unknown): boolean {
  return value === undefined || value === null
    || (typeof value === 'string' && value.length <= MAX_NOTES_LENGTH);
}

// today 由呼叫端傳台北日期，讓此檔保持純函式。
export function isValidTradeDate(value: unknown, today: string): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // 2026-02-30 這類日期 JS 會自動進位，轉回字串比對才擋得掉。
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  return value >= EARLIEST_DATE && value <= today;
}
