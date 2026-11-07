import { withSession } from '@/lib/auth';
import { getDailyPnl } from '@/lib/analytics/daily-pnl';

// 計算邏輯在 lib/analytics/daily-pnl.ts，網站與 MCP 共用
export async function GET(request: Request) {
  return withSession((session) => getDailyPnl(request, session));
}
