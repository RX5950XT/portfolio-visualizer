import { withSession } from '@/lib/auth';
import { getMetrics } from '@/lib/analytics/metrics';

// 計算邏輯在 lib/analytics/metrics.ts，網站與 MCP 共用
export async function GET(request: Request) {
  return withSession((session) => getMetrics(request, session));
}
