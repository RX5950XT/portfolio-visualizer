import { fetchHistory } from '@/lib/stocks';
import { fetchFxHistory, buildDenseRateMap, makeSharesResolver } from '@/lib/portfolio-history';

// 與 app/api/charts/asset-trend 的市值/成本計算邏輯一致，抽出供績效指標重用
// （asset-trend 維持原樣不動，避免回歸先前修正過的圖表正確性）

export interface EquityLot {
  id: string;
  symbol: string;
  shares: number;
  cost_price: number;
  purchase_date: string;
  market: 'US' | 'TW';
}

export interface SellRow {
  holding_id: string;
  shares: number;
  transaction_date: string;
}

export interface EquityCurve {
  dates: string[];
  values: number[]; // 每日市值（TWD）
  costs: number[]; // 每日成本（TWD）
  denseRateMap: Map<string, number>; // 每日 USD/TWD（forward-fill）
  getSharesAtDate: (lot: EquityLot, date: string) => number;
}

const EMPTY: EquityCurve = {
  dates: [],
  values: [],
  costs: [],
  denseRateMap: new Map(),
  getSharesAtDate: () => 0,
};

// 建立每日權益曲線（市值 + 成本，TWD）；非交易日 forward-fill
export async function buildEquityCurve(
  holdings: EquityLot[],
  sells: SellRow[]
): Promise<EquityCurve> {
  if (!holdings.length) return EMPTY;

  const earliestDate = holdings.reduce(
    (min, h) => (h.purchase_date < min ? h.purchase_date : min),
    holdings[0].purchase_date
  );

  // lot-based 下同一檔常有多筆，每檔只抓一次，減少 Yahoo 失敗造成的缺價
  const symbols = [...new Set(holdings.map((h) => h.symbol))];
  const [historyResults, fxSparse] = await Promise.all([
    Promise.all(
      symbols.map(async (symbol) => {
        const history = await fetchHistory(symbol, { startDate: earliestDate });
        const priceMap = new Map<string, number>();
        history.forEach((p) => priceMap.set(p.date, p.close));
        return { symbol, priceMap };
      })
    ),
    fetchFxHistory(earliestDate),
  ]);

  const historyMap = new Map(historyResults.map((r) => [r.symbol, r.priceMap]));

  const getSharesAtDate = makeSharesResolver(sells);

  const startDate = new Date(earliestDate);
  const endDate = new Date();
  const dateList: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dateList.push(d.toISOString().split('T')[0]);
  }

  const denseRateMap = buildDenseRateMap(fxSparse, dateList);

  const dates: string[] = [];
  const values: number[] = [];
  const costs: number[] = [];
  const lastKnownPrices = new Map<string, number>();

  for (const date of dateList) {
    let dailyValue = 0;
    let dailyCost = 0;
    let hasAnyHolding = false;

    // 不論當天是否持有都更新最後收盤，假日買進才拿得到前一個交易日的價格
    for (const [symbol, priceMap] of historyMap) {
      const close = priceMap.get(date);
      if (close !== undefined) lastKnownPrices.set(symbol, close);
    }

    for (const holding of holdings) {
      const shares = getSharesAtDate(holding, date);
      if (shares <= 0) continue;

      hasAnyHolding = true;
      const isUS = holding.market === 'US';
      const rate = isUS ? denseRateMap.get(date) ?? 32 : 1;

      const lotCost = shares * Number(holding.cost_price);
      dailyCost += isUS ? lotCost * rate : lotCost;

      // 尚無任何收盤價（新上市、抓價失敗）時以成本估值，避免市值憑空歸零再跳回
      const price = lastKnownPrices.get(holding.symbol) || Number(holding.cost_price);
      dailyValue += isUS ? shares * price * rate : shares * price;
    }

    if (hasAnyHolding && dailyValue > 0) {
      dates.push(date);
      values.push(Math.round(dailyValue));
      costs.push(Math.round(dailyCost));
    }
  }

  return { dates, values, costs, denseRateMap, getSharesAtDate };
}
