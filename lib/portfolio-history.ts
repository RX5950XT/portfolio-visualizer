import { fetchHistory } from '@/lib/stocks';

interface SellTx {
  holding_id: string;
  shares: number;
  transaction_date: string;
}

interface HoldingLot {
  id: string;
  shares: number;
  purchase_date: string;
}

// 取得指定起始日至今的每日 USD/TWD 匯率（稀疏 Map，僅含交易日）
export async function fetchFxHistory(startDate: string): Promise<Map<string, number>> {
  const history = await fetchHistory('USDTWD=X', { startDate });
  const map = new Map<string, number>();
  for (const h of history) {
    map.set(h.date, h.close);
  }
  return map;
}

// 對稀疏 FX map 做 forward-fill；早於最早資料的日期用首筆 back-fill，完全無資料時 fallback 32
export function buildDenseRateMap(
  sparseMap: Map<string, number>,
  sortedDates: string[]
): Map<string, number> {
  const dense = new Map<string, number>();
  if (sparseMap.size === 0) {
    for (const d of sortedDates) dense.set(d, 32);
    return dense;
  }
  const sortedFxDates = [...sparseMap.keys()].sort();
  let lastRate = sparseMap.get(sortedFxDates[0])!;
  for (const date of sortedDates) {
    const r = sparseMap.get(date);
    if (r !== undefined) lastRate = r;
    dense.set(date, lastRate);
  }
  return dense;
}

// 回傳一個函式：給定某個持股 lot 和日期，算出該日當天持有股數
// 公式：current_shares + 該 lot 在該日期「之後」賣出的股數加回
// 因為 current_shares 已是所有賣出後的剩餘值，要往前推就把後來的賣出加回
export function makeSharesResolver(sells: SellTx[]) {
  const sellsByHolding = new Map<string, { shares: number; date: string }[]>();
  for (const s of sells) {
    const id = s.holding_id;
    if (!sellsByHolding.has(id)) sellsByHolding.set(id, []);
    sellsByHolding.get(id)!.push({ shares: Number(s.shares), date: s.transaction_date });
  }

  return function getSharesAtDate(lot: HoldingLot, date: string): number {
    if (date < lot.purchase_date) return 0;
    const lotSells = sellsByHolding.get(lot.id) || [];
    const addedBack = lotSells
      .filter((s) => s.date > date)
      .reduce((sum, s) => sum + s.shares, 0);
    return Number(lot.shares) + addedBack;
  };
}
