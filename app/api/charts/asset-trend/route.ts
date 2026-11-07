import { withSession } from '@/lib/auth';
import { getAssetTrend } from '@/lib/analytics/asset-trend';

// 計算邏輯在 lib/analytics/asset-trend.ts，網站與 MCP 共用
export async function GET(request: Request) {
  return withSession((session) => getAssetTrend(request, session));
}
