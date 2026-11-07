import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidNotes, isValidSymbol, isValidTradeDate, MAX_NOTES_LENGTH } from './input-limits.ts';

const TODAY = '2026-11-07';

test('交易日期：可補登過去、當天可填', () => {
  for (const d of ['1970-01-01', '2024-06-13', TODAY]) assert.equal(isValidTradeDate(d, TODAY), true, d);
});

test('交易日期：未來、過早、格式錯、不存在的日期都擋', () => {
  for (const d of ['2026-11-08', '9999-12-31', '1969-12-31', '0001-01-01', '2026-02-30', '2026-1-1', 'abc', '', null, undefined, 20261107]) {
    assert.equal(isValidTradeDate(d, TODAY), false, String(d));
  }
});

test('代號：台美股與指數可過，超長或特殊字元擋', () => {
  for (const s of ['VT', 'brk-b', '0050.TW', '6547.TWO', '^GSPC', 'USDTWD=X']) assert.equal(isValidSymbol(s), true, s);
  for (const s of ['', 'A'.repeat(21), 'A B', '../x', 'A,B', null, 1]) assert.equal(isValidSymbol(s), false, String(s));
});

test('備註：選填，超過上限或非字串擋', () => {
  for (const n of [undefined, null, '', 'x'.repeat(MAX_NOTES_LENGTH)]) assert.equal(isValidNotes(n), true);
  for (const n of ['x'.repeat(MAX_NOTES_LENGTH + 1), 1, {}]) assert.equal(isValidNotes(n), false);
});
