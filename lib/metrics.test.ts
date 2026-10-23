import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  annualizedVolatility,
  benchmarkExcessReturn,
  drawdownSeries,
  drawdownStats,
  linkTwrIndex,
  indexAfterLastGap,
  maxDrawdown,
  periodReturns,
  sharesAcquired,
  sharpeRatio,
  sortinoRatio,
  winRate,
  xirr,
  type DayFlow,
} from './metrics.ts';

const closeTo = (actual: number | null, expected: number, tolerance = 1e-6): void => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual ?? 0) - expected) <= tolerance, `${actual} ≠ ${expected}`);
};

describe('風險調整報酬', () => {
  it('以 TWR 日報酬計算 Sharpe 與 Sortino', () => {
    const index = [100, 110, 104.5, 114.95];

    assert.ok((sharpeRatio(index, 0) ?? 0) > 0);
    // 日曆日序列以 √365 年化 = 舊 √252 結果 × √(365/252)
    closeTo(sortinoRatio(index, 0), 27.495454 * Math.sqrt(365 / 252), 1e-5);
    assert.ok(annualizedVolatility(index) > 0);
  });

  it('沒有下行波動時不回傳 Sortino', () => {
    assert.equal(sortinoRatio([100, 101, 102], 0), null);
    assert.equal(sortinoRatio([100], 0), null);
  });
});

describe('基準超額報酬', () => {
  it('回傳投組與基準同期累積報酬之差', () => {
    closeTo(benchmarkExcessReturn(0.2, 0.12), 0.08);
  });

  it('任一報酬缺失時回傳 null', () => {
    assert.equal(benchmarkExcessReturn(null, 0.12), null);
    assert.equal(benchmarkExcessReturn(0.2, null), null);
  });
});

describe('最大回撤期間', () => {
  it('回傳谷底、完整回撤期間與谷底後復原天數', () => {
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05', '2026-01-07'];
    const result = drawdownStats(dates, [0, -0.02, -0.1, -0.05, 0]);

    assert.deepEqual(result, {
      trough: -0.1,
      peakDate: '2026-01-01',
      troughDate: '2026-01-03',
      recoveryDate: '2026-01-07',
      durationDays: 6,
      recoveryDays: 4,
      recovered: true,
    });
  });

  it('尚未回到前高時標記未復原並計算已持續天數', () => {
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'];
    const result = drawdownStats(dates, [0, -0.02, -0.1, -0.05]);

    assert.equal(result.durationDays, 4);
    assert.equal(result.recoveryDays, null);
    assert.equal(result.recoveryDate, null);
    assert.equal(result.recovered, false);
  });

  it('資料不足或沒有回撤時回傳空白狀態', () => {
    assert.equal(drawdownStats([], []).trough, 0);
    assert.equal(drawdownStats(['2026-01-01'], [0]).peakDate, null);
    assert.equal(drawdownStats(['2026-01-01'], []).peakDate, null);
  });
});

describe('既有績效函式', () => {
  it('計算回撤序列與最大回撤', () => {
    const series = drawdownSeries([100, 120, 90, 108]);
    assert.deepEqual(series.slice(0, 3), [0, 0, -0.25]);
    closeTo(series[3], -0.1);
    closeTo(maxDrawdown([100, 120, 90, 108]), -0.25);
  });

  it('計算勝率與 XIRR', () => {
    assert.deepEqual(winRate([10, -5, 2, 0]), { wins: 2, total: 4, rate: 0.5 });
    closeTo(
      xirr([
        { date: '2025-01-01', amount: -100 },
        { date: '2026-01-01', amount: 110 },
      ]),
      0.1
    );
    assert.equal(xirr([{ date: '2025-01-01', amount: -100 }]), null);
  });

  it('切分 Total、YTD、年度與年化 TWR', () => {
    const result = periodReturns(
      ['2025-12-31', '2026-01-01', '2026-12-31'],
      [1, 1.1, 1.21]
    );

    closeTo(result.total, 0.21);
    closeTo(result.ytd, 0.21);
    closeTo(result.annualized, 0.21);
    assert.deepEqual(result.years.map(({ year }) => year), [2025, 2026]);
    closeTo(result.years[0].return, 0);
    closeTo(result.years[1].return, 0.21);
  });

  it('拒絕無效期間資料', () => {
    assert.equal(periodReturns([], []).total, null);
    assert.equal(periodReturns(['2026-01-01', '2026-12-31'], [1, 1.5]).annualized, null);
    assert.notEqual(periodReturns(['2025-01-01', '2026-01-01'], [1, 1.5]).annualized, null);
    assert.equal(periodReturns(['2026-01-01', '2026-01-02'], [0, 1]).total, null);
  });
});

describe('空手缺口的 TWR', () => {
  it('賣光與重新買進分兩段連乘，不混成一筆', () => {
    const flows = new Map<string, DayFlow>([
      ['2024-11-11', { buy: 0, sell: 11381 }],
      ['2024-12-10', { buy: 1148, sell: 0 }],
    ]);
    const index = linkTwrIndex(['2024-11-10', '2024-12-10'], [11000, 1200], flows);
    closeTo(index[1], (11381 / 11000) * (1200 / 1148), 1e-9);
  });

  it('買進計入當日本金，小部位大筆加碼不會暴漲', () => {
    const flows = new Map<string, DayFlow>([['2026-01-16', { buy: 1_000_000, sell: 0 }]]);
    const index = linkTwrIndex(['2026-01-15', '2026-01-16'], [5000, 1_015_000], flows);
    closeTo(index[1], 1_015_000 / 1_005_000, 1e-9);
  });

  it('首日成交價到收盤的漲跌記在 index[0]', () => {
    const flows = new Map<string, DayFlow>([['2026-01-15', { buy: 100_000, sell: 0 }]]);
    const index = linkTwrIndex(['2026-01-15', '2026-01-16'], [101_000, 103_020], flows);
    closeTo(index[0], 1.01, 1e-9);
    closeTo(index[1], 1.0302, 1e-9);
  });

  it('同日買賣：買進算期初、賣出算期末', () => {
    const flows = new Map<string, DayFlow>([['2026-01-16', { buy: 573, sell: 100 }]]);
    const index = linkTwrIndex(['2026-01-15', '2026-01-16'], [300000, 300000], flows);
    closeTo(index[1], 300100 / 300573, 1e-9);
  });

  it('買進當日已賣出的股數要加回取得股數', () => {
    assert.equal(sharesAcquired(0, 16000), 16000);
    assert.equal(sharesAcquired(650, 350), 1000);
  });

  it('績效從最後一次空手重新進場起算', () => {
    const dates = ['2024-06-13', '2024-11-11', '2025-12-08', '2025-12-09'];
    assert.equal(indexAfterLastGap(dates), 2);
    assert.equal(indexAfterLastGap(['2025-12-08', '2025-12-09', '2025-12-10']), 0);
  });
});
