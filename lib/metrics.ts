// 投資組合績效指標（純函式，無副作用）

export interface CashFlow {
  date: string; // YYYY-MM-DD
  amount: number; // 流入為正、流出為負
}

const MS_PER_YEAR = 365 * 24 * 3600 * 1000;

// 日報酬序列（跳過前一日為 0 的情況）
function dailyReturns(values: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) rets.push(values[i] / values[i - 1] - 1);
  }
  return rets;
}

// 最大回撤（peak-to-trough），回傳 <= 0 的比例
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

// 每日回撤序列（供 underwater 圖），各值 <= 0
export function drawdownSeries(values: number[]): number[] {
  let peak = -Infinity;
  return values.map((v) => {
    if (v > peak) peak = v;
    return peak > 0 ? v / peak - 1 : 0;
  });
}

// 年化波動率（日報酬標準差 × √252）
export function annualizedVolatility(values: number[]): number {
  const rets = dailyReturns(values);
  if (rets.length < 2) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

// XIRR（金額加權年化報酬）：牛頓法為主、二分法後援
export function xirr(flows: CashFlow[]): number | null {
  const cf = flows
    .filter((f) => f.amount !== 0)
    .map((f) => ({ t: new Date(f.date).getTime(), a: f.amount }))
    .sort((x, y) => x.t - y.t);

  if (cf.length < 2) return null;
  if (!cf.some((f) => f.a < 0) || !cf.some((f) => f.a > 0)) return null;

  const t0 = cf[0].t;
  const yearFrac = (t: number) => (t - t0) / MS_PER_YEAR;
  const npv = (rate: number) =>
    cf.reduce((s, f) => s + f.a / Math.pow(1 + rate, yearFrac(f.t)), 0);
  const dnpv = (rate: number) =>
    cf.reduce((s, f) => {
      const y = yearFrac(f.t);
      return s - (y * f.a) / Math.pow(1 + rate, y + 1);
    }, 0);

  // 牛頓法
  let rate = 0.1;
  for (let i = 0; i < 50; i++) {
    const v = npv(rate);
    const d = dnpv(rate);
    if (Math.abs(v) < 1e-6) return rate;
    if (d === 0) break;
    let next = rate - v / d;
    if (!Number.isFinite(next)) break;
    if (next <= -0.9999) next = -0.9999;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next;
  }

  // 二分法後援
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if (flo * fm < 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

// 勝率（已實現賣出中獲利的比例）
export function winRate(realizedPnls: number[]): { wins: number; total: number; rate: number } {
  const total = realizedPnls.length;
  const wins = realizedPnls.filter((p) => p > 0).length;
  return { wins, total, rate: total > 0 ? wins / total : 0 };
}
