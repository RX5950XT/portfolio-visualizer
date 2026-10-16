import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAssetTrend } from '@/lib/analytics/asset-trend';

// 計算邏輯在 lib/analytics/asset-trend.ts，網站與 MCP 共用
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '未授權' }, { status: 401 });
  return getAssetTrend(request, session);
}
