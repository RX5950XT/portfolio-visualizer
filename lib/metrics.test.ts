import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  annualizedVolatility,
  benchmarkExcessReturn,
  drawdownSeries,
  drawdownStats,
  maxDrawdown,
  periodReturns,
  sharpeRatio,
  sortinoRatio,
  winRate,
  xirr,
} from './metrics.ts';

const closeTo = (actual: number | null, expected: number, tolerance = 1e-6): void => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual ?? 0) - expected) <= tolerance, `${actual} ≠ ${expected}`);
};

describe('風險調整報酬', () => {
  it('以 TWR 日報酬計算 Sharpe 與 Sortino', () => {
    const index = [100, 110, 104.5, 114.95];

    assert.ok((sharpeRatio(index, 0) ?? 0) > 0);
    closeTo(sortinoRatio(index, 0), 27.495454, 1e-5);
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
    assert.equal(periodReturns(['2026-01-01', '2026-01-02'], [0, 1]).total, null);
  });
});
