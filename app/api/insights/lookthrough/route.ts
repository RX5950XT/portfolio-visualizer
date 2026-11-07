import { withSession } from '@/lib/auth';
import { getLookthrough } from '@/lib/analytics/lookthrough';

// 計算邏輯在 lib/analytics/lookthrough.ts，網站與 MCP 共用
export async function GET(request: Request) {
  return withSession((session) => getLookthrough(request, session));
}
