import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';

export interface AddHoldingArgs { portfolio_id: string; symbol: string; shares: number; cost_price: number; purchase_date: string }
export interface SellHoldingArgs { portfolio_id: string; symbol: string; shares: number; price: number; transaction_date: string; notes?: string }

export interface UpdateHoldingArgs { lot_id: string; symbol?: string; shares?: number; cost_price?: number; purchase_date?: string }
export interface SetCashArgs { portfolio_id: string; amount_twd: number }

export type AnalyticsKind = 'performance' | 'asset_trend' | 'daily_pnl' | 'dividends' | 'lookthrough';
export interface AnalyticsArgs { portfolio_id?: string; days?: number; start?: string; end?: string }

export interface PortfolioStore {
  list(): Promise<{ id: string; name: string; is_default: boolean }[]>;
  snapshot(portfolioId: string | undefined): Promise<Record<string, unknown>>;
  trades(portfolioId: string | undefined): Promise<Record<string, unknown>>;
  addHolding(args: AddHoldingArgs): Promise<Record<string, unknown>>;
  sell(args: SellHoldingArgs): Promise<Record<string, unknown>>;
  updateHolding(args: UpdateHoldingArgs): Promise<Record<string, unknown>>;
  setCash(args: SetCashArgs): Promise<Record<string, unknown>>;
  analytics(kind: AnalyticsKind, args: AnalyticsArgs): Promise<Record<string, unknown>>;
}

// 訊息可安全回給 AI 的錯誤（例如股數不足）；其他錯誤一律以通用訊息回覆。
export class ToolInputError extends Error {}

async function toolResult(read: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    const data = await read();
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
  } catch (error) {
    if (error instanceof ToolInputError) return { isError: true, content: [{ type: 'text', text: error.message }] };
    console.error('MCP 操作失敗:', error);
    return { isError: true, content: [{ type: 'text', text: '無法讀取或寫入投資組合，請確認組合仍存在或稍後重試。' }] };
  }
}

const portfolioId = z.uuid().describe('portfolio_list 回傳的組合 UUID');
const symbol = z.string().trim().regex(/^[A-Za-z0-9.^=-]{1,20}$/).describe('股票代號；台股加 .TW（如 0050.TW），美股直接寫（如 VT）');
const positive = z.number().positive().finite();
const date = z.iso.date();

export function createPortfolioMcpServer(store: PortfolioStore): McpServer {
  const server = new McpServer({ name: 'portfolio-visualizer-mcp-server', version: '1.1.0' });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  server.registerTool('portfolio_list', {
    title: '投資組合清單',
    description: '列出管理員的真實投資組合（不含 Demo 沙盒），取得其他工具使用的 portfolio_id。',
    inputSchema: z.object({}).strict(),
    annotations,
  }, () => toolResult(async () => ({ portfolios: await store.list() })));
  server.registerTool('portfolio_snapshot', {
    title: '投資組合現況',
    description: '讀取持股股數、報價、現金、成本、未實現損益、配置比例與 ETF 費用率。金額為 TWD，price 為標的原幣；weight、gainPercent 為百分點（25 = 25%）；expenseRatio 與 weightedExpenseRatio 為小數（0.0007 = 0.07%），非 ETF 為 null，weightedExpenseRatio 以 ETF 市值加權、分母為全部股票市值（同網站）。省略 portfolio_id 會合併全部真實組合。先看 valuationComplete 與 warnings；缺報價時總額不完整，不能當成實際損失。報酬為現有持股未實現損益，非 TWR 或已實現報酬。',
    inputSchema: z.object({ portfolio_id: portfolioId.optional() }).strict(),
    annotations,
  }, ({ portfolio_id }) => toolResult(() => store.snapshot(portfolio_id)));
  server.registerTool('portfolio_trades', {
    title: '買賣紀錄與已實現損益',
    description: '讀取每一筆買入批次（日期、原幣成本價、買入股數、剩餘股數）與賣出紀錄（日期、原幣成交價、股數、已實現損益 TWD），並依標的彙總已賣出股數與已實現損益。sharesBought 為剩餘股數加已賣出股數。省略 portfolio_id 會合併全部真實組合。',
    inputSchema: z.object({ portfolio_id: portfolioId.optional() }).strict(),
    annotations,
  }, ({ portfolio_id }) => toolResult(() => store.trades(portfolio_id)));
  const scoped = z.object({ portfolio_id: portfolioId.optional() }).strict();
  const analytics: [string, AnalyticsKind, string, string, z.ZodObject][] = [
    ['portfolio_performance', 'performance', '績效分析',
      '同網站績效分析：returns（TWR 累積 total、ytd、annualized、各曆年 years）、xirr、volatility、sharpe、sortino、winRate、benchmark（同期 S&P 500 以台幣含匯率計的累積報酬與超額報酬）、drawdown（最大回撤摘要）與 benchmarkTrough（同期 S&P 500 最深回撤）。報酬與回撤皆為小數（0.12 = 12%）。同期＝投組首筆買入日至今。資料不足時 data 為 null。', scoped],
    ['portfolio_asset_trend', 'asset_trend', '股票總值走勢',
      '同網站股票總值走勢：每日 value（股票市值 TWD，不含現金）、cost（成本 TWD）、benchmark（同樣投入金額買 S&P 500 的市值 TWD）。', scoped],
    ['portfolio_daily_pnl', 'daily_pnl', '每日損益',
      '同網站每日損益：每日 pnl（TWD，只列有變動的交易日）。預設最近 30 筆；可傳 days，或同時傳 start 與 end（YYYY-MM-DD）指定區間。',
      z.object({
        portfolio_id: portfolioId.optional(),
        days: z.number().int().min(1).max(3650).optional().describe('最近幾筆，預設 30'),
        start: date.optional().describe('區間起日，需與 end 同時提供'),
        end: date.optional().describe('區間迄日'),
      }).strict().refine((v) => !v.start === !v.end && !(v.start && v.days), { message: 'start 與 end 需同時提供，且不可與 days 並用' })],
    ['portfolio_dividends', 'dividends', '配息追蹤',
      '同網站配息追蹤：annualEstimate（預估年配息 TWD）、thisMonthIncome、yieldRate 與 yieldOnCost（小數）、monthly（近 12 月各月配息 TWD）、upcoming（即將除息）。無持股時 data 為 null。', scoped],
    ['portfolio_lookthrough', 'lookthrough', '配置透視',
      '同網站配置透視：穿透 ETF 後的 realHoldings（direct 直接持有、viaEtf 透過 ETF、total 皆 TWD；pct 為小數；warn 表示單一個股 >10%）、sectors 產業分佈、regions 地區分佈。ETF 成分以 Yahoo 前十大持股估算。', scoped],
  ];
  for (const [name, kind, title, description, inputSchema] of analytics) {
    server.registerTool(name, { title, description, inputSchema, annotations },
      (args) => toolResult(() => store.analytics(kind, args as AnalyticsArgs)));
  }
  server.registerTool('holding_add', {
    title: '新增持股',
    description: '在指定組合新增一筆買入批次，與網站「新增持股」相同：不會扣除現金。呼叫前先向使用者確認代號、股數、成本價與日期；重複呼叫會新增重複批次。',
    inputSchema: z.object({
      portfolio_id: portfolioId, symbol,
      shares: positive.describe('買入股數'),
      cost_price: positive.describe('每股成本，標的原幣（美股 USD、台股 TWD）'),
      purchase_date: date.describe('買入日期 YYYY-MM-DD'),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (args) => toolResult(() => store.addHolding(args)));
  server.registerTool('holding_sell', {
    title: '賣出持股',
    description: '賣出指定組合中某標的的股數，與網站「賣出」相同：所有批次依比例扣減、以加權均價計算已實現損益，並把賣出金額加回該組合現金。呼叫前先向使用者確認；重複呼叫會重複賣出。',
    inputSchema: z.object({
      portfolio_id: portfolioId, symbol,
      shares: positive.describe('賣出股數，不可超過持有量'),
      price: positive.describe('每股成交價，標的原幣'),
      transaction_date: date.describe('賣出日期 YYYY-MM-DD'),
      notes: z.string().max(500).optional().describe('備註'),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, (args) => toolResult(() => store.sell(args)));
  server.registerTool('holding_update', {
    title: '編輯持股批次',
    description: '編輯一筆買入批次，與網站「編輯持股」相同：覆寫代號、股數、成本價、買入日；只需傳要改的欄位，其餘沿用原值。lot_id 取自 portfolio_trades 的 buys[].lotId（僅限仍有剩餘股數的批次）。修改股數會直接改剩餘股數，不會產生賣出紀錄或調整現金；要賣出請用 holding_sell。呼叫前先向使用者確認。',
    inputSchema: z.object({
      lot_id: z.uuid().describe('portfolio_trades 回傳的 lotId'),
      symbol: symbol.optional(),
      shares: positive.optional().describe('新的剩餘股數'),
      cost_price: positive.optional().describe('新的每股成本，標的原幣'),
      purchase_date: date.optional().describe('新的買入日期 YYYY-MM-DD'),
    }).strict().refine((v) => v.symbol !== undefined || v.shares !== undefined || v.cost_price !== undefined || v.purchase_date !== undefined, { message: '至少要修改一個欄位' }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, (args) => toolResult(() => store.updateHolding(args)));
  server.registerTool('cash_set', {
    title: '設定現金',
    description: '把指定組合的現金餘額直接設為新金額（TWD），與網站「修改現金」相同；不是加減，是覆寫。回傳修改前後金額。呼叫前先向使用者確認。',
    inputSchema: z.object({
      portfolio_id: portfolioId,
      amount_twd: z.number().min(0).finite().describe('新的現金餘額，新台幣'),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, (args) => toolResult(() => store.setCash(args)));
  return server;
}
