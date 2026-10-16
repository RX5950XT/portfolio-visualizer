import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyPnLDateRange } from './chart-period.ts';

test('YTD 使用台灣日期，跨年凌晨從當年一月一日開始', () => {
  assert.deepEqual(dailyPnLDateRange('ytd', new Date('2025-12-31T16:30:00Z')), {
    start: '2026-01-01', end: '2026-01-01',
  });
  assert.deepEqual(dailyPnLDateRange('ytd', new Date('2026-10-16T06:00:00Z')), {
    start: '2026-01-01', end: '2026-10-16',
  });
});

test('近一年使用曆年區間，閏日回到前一年二月最後一天', () => {
  assert.deepEqual(dailyPnLDateRange('year', new Date('2026-10-16T06:00:00Z')), {
    start: '2025-10-16', end: '2026-10-16',
  });
  assert.deepEqual(dailyPnLDateRange('year', new Date('2024-02-29T06:00:00Z')), {
    start: '2023-02-28', end: '2024-02-29',
  });
});
