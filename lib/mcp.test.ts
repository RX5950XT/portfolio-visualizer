import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebStandardStreamableHTTPServerTransport, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/server';
import { createMcpToken, hashMcpToken, verifyMcpToken } from './mcp-token.ts';
import { createPortfolioMcpServer, ToolInputError, type PortfolioStore } from './mcp-server.ts';

const reader: PortfolioStore = {
  async list() { return [{ id: '123e4567-e89b-42d3-a456-426614174000', name: '退休帳戶', is_default: true }]; },
  async snapshot(portfolioId) { return { portfolioId, cashTwd: 100, holdings: [], totalAssetsTwd: 100 }; },
  async trades(portfolioId) { return { portfolioId, buys: [], sells: [], totalRealizedPnlTwd: 0 }; },
  async addHolding(args) { return { ...args }; },
  async sell(args) { return { ...args, realized_pnl_twd: 10 }; },
  async analytics(kind, args) { return { kind, ...args, data: null }; },
  async updateHolding(args) { return { ...args }; },
  async setCash(args) { return { ...args }; },
};

async function rpc(method: string, params: Record<string, unknown>, source = reader): Promise<Response> {
  const server = createPortfolioMcpServer(source);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }));
  } finally {
    await server.close();
  }
}

test('MCP 金鑰使用隨機值與雜湊比對；撤銷或重設後舊金鑰失效', () => {
  const token = createMcpToken();
  const next = createMcpToken();
  assert.match(token, /^pv_[a-f0-9]{64}$/);
  assert.notEqual(token, next);
  assert.equal(verifyMcpToken(token, hashMcpToken(token)), true);
  for (const invalid of ['', token + 'x', token.replace('pv_', 'xx_'), next]) {
    assert.equal(verifyMcpToken(invalid, hashMcpToken(token)), false);
  }
  assert.equal(verifyMcpToken(token, ''), false);
  assert.equal(verifyMcpToken(token, hashMcpToken(next)), false);
});

test('Streamable HTTP 初始化相容一般 MCP 用戶端', async () => {
  const res = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.result.serverInfo.name, 'portfolio-visualizer-mcp-server');
  assert.ok(json.result.capabilities.tools);
  const latest = await rpc('initialize', { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(latest.status, 200);
});

test('八個唯讀工具與四個寫入工具，清單與快照均回傳可讀文字及結構資料', async () => {
  const tools = (await (await rpc('tools/list', {})).json()).result.tools as { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[];
  assert.deepEqual(tools.map((tool) => tool.name), ['portfolio_list', 'portfolio_snapshot', 'portfolio_trades', 'portfolio_performance', 'portfolio_asset_trend', 'portfolio_daily_pnl', 'portfolio_dividends', 'portfolio_lookthrough', 'holding_add', 'holding_sell', 'holding_update', 'cash_set']);
  const readOnly = tools.filter((tool) => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint).map((tool) => tool.name);
  assert.deepEqual(readOnly, ['portfolio_list', 'portfolio_snapshot', 'portfolio_trades', 'portfolio_performance', 'portfolio_asset_trend', 'portfolio_daily_pnl', 'portfolio_dividends', 'portfolio_lookthrough']);
  assert.equal(tools.find((tool) => tool.name === 'holding_sell')?.annotations.destructiveHint, true);
  const list = (await (await rpc('tools/call', { name: 'portfolio_list', arguments: {} })).json()).result;
  assert.deepEqual(JSON.parse(list.content[0].text), list.structuredContent);
  assert.equal(list.structuredContent.portfolios[0].name, '退休帳戶');
  const snapshot = (await (await rpc('tools/call', { name: 'portfolio_snapshot', arguments: { portfolio_id: '123e4567-e89b-42d3-a456-426614174000' } })).json()).result;
  assert.equal(snapshot.structuredContent.cashTwd, 100);
  assert.equal(snapshot.structuredContent.portfolioId, '123e4567-e89b-42d3-a456-426614174000');
});

const PID = '123e4567-e89b-42d3-a456-426614174000';
const call = async (name: string, args: Record<string, unknown>, source = reader) =>
  (await (await rpc('tools/call', { name, arguments: args }, source)).json());

test('寫入工具只接受合法欄位，不合法時不碰資料', async () => {
  let writes = 0;
  const source: PortfolioStore = { ...reader, async addHolding() { writes++; return {}; }, async sell() { writes++; return {}; } };
  const add = { portfolio_id: PID, symbol: '0050.TW', shares: 10, cost_price: 150, purchase_date: '2026-10-01' };
  const sell = { portfolio_id: PID, symbol: 'VT', shares: 1, price: 120, transaction_date: '2026-10-01' };
  for (const bad of [{ ...add, shares: 0 }, { ...add, cost_price: -1 }, { ...add, purchase_date: '2026/10/01' },
    { ...add, symbol: 'VT; drop' }, { ...add, portfolio_id: undefined }, { ...add, demo_space: 'x' }]) {
    const json = await call('holding_add', bad, source);
    assert.ok(json.result?.isError || json.error);
  }
  for (const bad of [{ ...sell, shares: -5 }, { ...sell, price: 0 }, { ...sell, notes: 'x'.repeat(501) }, { ...sell, lot_ids: ['a'] }]) {
    const json = await call('holding_sell', bad, source);
    assert.ok(json.result?.isError || json.error);
  }
  assert.equal(writes, 0);
  assert.equal((await call('holding_add', add, source)).result.isError, undefined);
  assert.equal((await call('holding_sell', { ...sell, notes: '停利' }, source)).result.isError, undefined);
  assert.equal(writes, 2);
});

test('寫入結果回傳結構資料；可修正錯誤原文回給 AI', async () => {
  const sold = (await call('holding_sell', { portfolio_id: PID, symbol: 'VT', shares: 1, price: 120, transaction_date: '2026-10-01' })).result;
  assert.equal(sold.structuredContent.realized_pnl_twd, 10);
  const trades = (await call('portfolio_trades', { portfolio_id: PID })).result;
  assert.deepEqual(trades.structuredContent.buys, []);
  const source: PortfolioStore = { ...reader, async sell() { throw new ToolInputError('賣出股數 (5) 超過持有量 (3)'); } };
  const json = (await call('holding_sell', { portfolio_id: PID, symbol: 'VT', shares: 5, price: 1, transaction_date: '2026-10-01' }, source)).result;
  assert.equal(json.isError, true);
  assert.match(json.content[0].text, /超過持有量/);
});

test('拒絕不合法 UUID、額外角色參數與未提供的工具', async () => {
  let reads = 0;
  const source: PortfolioStore = { ...reader, async snapshot() { reads++; return {}; } };
  for (const args of [{ portfolio_id: 'invalid' }, { role: 'admin' }, { demo_space: 'other' }]) {
    const json = await (await rpc('tools/call', { name: 'portfolio_snapshot', arguments: args }, source)).json();
    assert.ok(json.result?.isError || json.error);
  }
  assert.equal(reads, 0);
  const write = await (await rpc('tools/call', { name: 'portfolio_delete', arguments: {} })).json();
  assert.ok(write.result?.isError || write.error);
});

test('資料錯誤不冒充空資產，也不把錯誤細節回傳給 AI', async () => {
  const source: PortfolioStore = { ...reader, async snapshot() { throw new Error('private-database-details'); } };
  const json = await (await rpc('tools/call', { name: 'portfolio_snapshot', arguments: {} }, source)).json();
  assert.equal(json.result.isError, true);
  assert.equal(json.result.structuredContent, undefined);
  assert.doesNotMatch(JSON.stringify(json), /private-database-details/);
});

test('分析工具傳遞正確種類與參數；每日損益區間參數需成對且不可與 days 並用', async () => {
  const calls: unknown[] = [];
  const source: PortfolioStore = { ...reader, async analytics(kind, args) { calls.push({ kind, ...args }); return { data: null }; } };
  await call('portfolio_performance', { portfolio_id: PID }, source);
  await call('portfolio_daily_pnl', { days: 60 }, source);
  await call('portfolio_daily_pnl', { start: '2026-01-01', end: '2026-10-16' }, source);
  for (const bad of [{ start: '2026-01-01' }, { start: '2026-01-01', end: '2026-02-01', days: 5 }, { days: 0 }, { portfolio_id: 'x' }]) {
    const json = await call('portfolio_daily_pnl', bad, source);
    assert.ok(json.result?.isError || json.error);
  }
  assert.deepEqual(calls, [
    { kind: 'performance', portfolio_id: PID },
    { kind: 'daily_pnl', days: 60 },
    { kind: 'daily_pnl', start: '2026-01-01', end: '2026-10-16' },
  ]);
});

test('編輯與現金工具：只接受合法欄位，不合法時不碰資料', async () => {
  let writes = 0;
  const source: PortfolioStore = { ...reader, async updateHolding() { writes++; return {}; }, async setCash() { writes++; return {}; } };
  for (const bad of [{ lot_id: PID }, { lot_id: 'x', shares: 1 }, { lot_id: PID, shares: 0 }, { lot_id: PID, purchase_date: '10/01' }, { lot_id: PID, shares: 1, portfolio_id: PID }]) {
    const json = await call('holding_update', bad, source);
    assert.ok(json.result?.isError || json.error);
  }
  for (const bad of [{ portfolio_id: PID }, { portfolio_id: PID, amount_twd: -1 }, { amount_twd: 100 }, { portfolio_id: PID, amount_twd: '100' }]) {
    const json = await call('cash_set', bad, source);
    assert.ok(json.result?.isError || json.error);
  }
  assert.equal(writes, 0);
  assert.equal((await call('holding_update', { lot_id: PID, cost_price: 10.5 }, source)).result.isError, undefined);
  assert.equal((await call('cash_set', { portfolio_id: PID, amount_twd: 0 }, source)).result.isError, undefined);
  assert.equal(writes, 2);
});
