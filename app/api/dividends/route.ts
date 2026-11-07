import { withSession } from '@/lib/auth';
import { getDividends } from '@/lib/analytics/dividends';

// 計算邏輯在 lib/analytics/dividends.ts，網站與 MCP 共用
export async function GET(request: Request) {
  return withSession((session) => getDividends(request, session));
}
