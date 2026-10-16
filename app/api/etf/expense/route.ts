import { getEtfExpense } from '@/lib/analytics/etf-expense';

// 計算邏輯在 lib/analytics/etf-expense.ts，網站與 MCP 共用
export async function GET(request: Request) {
  return getEtfExpense(request);
}
