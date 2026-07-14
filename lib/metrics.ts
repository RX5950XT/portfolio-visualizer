// 投資組合績效指標（純函式，無副作用）

export interface CashFlow {
  date: string; // YYYY-MM-DD
  amount: number; // 流入為正、流出為負
}

const MS_PER_YEAR = 365 * 24 * 3600 * 1000;
const MS_PER_DAY = 24 * 3600 * 1000;

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

// Sharpe 的報酬與波動都必須源自同一條 TWR 日報酬序列，避免混入資金時點影響。
export function sharpeRatio(values: number[], annualRiskFreeRate: number): number | null {
  const rets = dailyReturns(values);
  if (rets.length < 2) return null;

  const mean = rets.reduce((sum, value) => sum + value, 0) / rets.length;
  const variance = rets.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (rets.length - 1);
  const standardDeviation = Math.sqrt(variance);
  if (standardDeviation === 0) return null;

  const dailyRiskFreeRate = Math.pow(1 + annualRiskFreeRate, 1 / 252) - 1;
  return ((mean - dailyRiskFreeRate) / standardDeviation) * Math.sqrt(252);
}

// Sortino 只將低於目標報酬的日報酬視為風險，避免上漲波動拉低分數。
export function sortinoRatio(values: number[], annualTargetRate: number): number | null {
  const rets = dailyReturns(values);
  if (rets.length < 2 || annualTargetRate <= -1) return null;

  const dailyTargetRate = Math.pow(1 + annualTargetRate, 1 / 252) - 1;
  const mean = rets.reduce((sum, value) => sum + value, 0) / rets.length;
  const downsideVariance =
    rets.reduce((sum, value) => sum + Math.min(0, value - dailyTargetRate) ** 2, 0) /
    rets.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  if (downsideDeviation === 0) return null;

  return ((mean - dailyTargetRate) / downsideDeviation) * Math.sqrt(252);
}

export function benchmarkExcessReturn(
  portfolioReturn: number | null,
  benchmarkReturn: number | null
): number | null {
  if (
    portfolioReturn === null ||
    benchmarkReturn === null ||
    !Number.isFinite(portfolioReturn) ||
    !Number.isFinite(benchmarkReturn)
  ) {
    return null;
  }
  return portfolioReturn - benchmarkReturn;
}

export interface DrawdownStats {
  trough: number;
  peakDate: string | null;
  troughDate: string | null;
  recoveryDate: string | null;
  durationDays: number;
  recoveryDays: number | null;
  recovered: boolean;
}

const EMPTY_DRAWDOWN_STATS: DrawdownStats = {
  trough: 0,
  peakDate: null,
  troughDate: null,
  recoveryDate: null,
  durationDays: 0,
  recoveryDays: null,
  recovered: true,
};

const daysBetween = (start: string, end: string): number => {
  const difference = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(difference) ? Math.max(0, Math.round(difference / MS_PER_DAY)) : 0;
};

// 取最大回撤所屬的一段 peak-to-recovery；未復原時以序列末日計算已持續天數。
export function drawdownStats(dates: string[], drawdowns: number[]): DrawdownStats {
  if (dates.length === 0 || dates.length !== drawdowns.length) return EMPTY_DRAWDOWN_STATS;

  let troughIndex = 0;
  for (let i = 1; i < drawdowns.length; i++) {
    if (drawdowns[i] < drawdowns[troughIndex]) troughIndex = i;
  }
  if (drawdowns[troughIndex] >= 0) return EMPTY_DRAWDOWN_STATS;

  let peakIndex = troughIndex;
  while (peakIndex > 0 && drawdowns[peakIndex] < 0) peakIndex--;

  let recoveryIndex: number | null = null;
  for (let i = troughIndex + 1; i < drawdowns.length; i++) {
    if (drawdowns[i] >= -1e-10) {
      recoveryIndex = i;
      break;
    }
  }

  const endIndex = recoveryIndex ?? drawdowns.length - 1;
  return {
    trough: drawdowns[troughIndex],
    peakDate: dates[peakIndex],
    troughDate: dates[troughIndex],
    recoveryDate: recoveryIndex === null ? null : dates[recoveryIndex],
    durationDays: daysBetween(dates[peakIndex], dates[endIndex]),
    recoveryDays:
      recoveryIndex === null ? null : daysBetween(dates[troughIndex], dates[recoveryIndex]),
    recovered: recoveryIndex !== null,
  };
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

// 單一曆年的 TWR 累積報酬
export interface YearReturn {
  year: number;
  return: number;
  startDate: string; // 該年在序列中的第一日
  endDate: string; // 該年在序列中的最後一日
}

// 期間報酬率總覽（皆為 TWR 累積，非年化）
export interface PeriodReturnSummary {
  total: number | null; // 自成立以來累積
  ytd: number | null; // 今年至今累積（等於最後一個曆年的累積）
  annualized: number | null; // 自成立以來 TWR 年化
  years: YearReturn[]; // 各曆年累積，年份遞增
}

const EMPTY_RETURNS: PeriodReturnSummary = {
  total: null,
  ytd: null,
  annualized: null,
  years: [],
};

// 期間報酬率：吃 route 已算好的 TWR 指數（index[0]=1、剝離買賣現金流），只做期間切分。
// 各年報酬 = 該年最後一日 index ÷「前一日 index」− 1；首年基準為 index[0]（起始資本）。
// 因每年基準取緊鄰前一日，各年 (1+r) 連乘會 telescoping 為 (1 + total)，數字自洽。
export function periodReturns(dates: string[], index: number[]): PeriodReturnSummary {
  if (dates.length < 2 || dates.length !== index.length) return EMPTY_RETURNS;

  const startIndex = index[0];
  const lastIndex = index[index.length - 1];
  if (!(startIndex > 0) || !Number.isFinite(lastIndex)) return EMPTY_RETURNS;

  // 每個曆年在序列中的首、末索引（dates 遞增，掃描一次即可）
  const bounds = new Map<number, { first: number; last: number }>();
  for (let i = 0; i < dates.length; i++) {
    const year = Number(dates[i].slice(0, 4));
    const b = bounds.get(year);
    if (b) b.last = i;
    else bounds.set(year, { first: i, last: i });
  }

  const years: YearReturn[] = [];
  for (const year of [...bounds.keys()].sort((a, b) => a - b)) {
    const { first, last } = bounds.get(year)!;
    const base = first === 0 ? startIndex : index[first - 1];
    if (!(base > 0) || !Number.isFinite(index[last])) continue;
    years.push({
      year,
      return: index[last] / base - 1,
      startDate: dates[first],
      endDate: dates[last],
    });
  }

  // ytd 取最後一個曆年的累積：序列末日即「今天」，故末年 = 今年至今
  const elapsedMs = new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime();
  const elapsedYears = elapsedMs / MS_PER_YEAR;
  const growth = lastIndex / startIndex;
  const annualized =
    elapsedYears > 0 && growth > 0 ? Math.pow(growth, 1 / elapsedYears) - 1 : null;

  return {
    total: growth - 1,
    ytd: years.length ? years[years.length - 1].return : lastIndex / startIndex - 1,
    annualized,
    years,
  };
}
