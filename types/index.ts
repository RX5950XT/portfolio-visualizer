// 股票類型定義
export interface Holding {
  id: string;
  symbol: string;
  shares: number;
  cost_price: number;
  purchase_date: string;
  market: "US" | "TW";
  created_at: string;
  updated_at: string;
}

// 股票報價
export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

// 每日快照
export interface DailySnapshot {
  id: string;
  snapshot_date: string;
  total_value_twd: number;
  exchange_rate: number;
  created_at: string;
}

// ETF 費用率
export interface ETFExpenseRatio {
  symbol: string;
  expense_ratio: number;
  source: "auto" | "manual";
  updated_at: string;
}

// 持股搭配即時報價
export interface HoldingWithQuote extends Holding {
  totalCost?: number;      // 買入總成本（原幣）
  totalCostTWD?: number;   // 買入總成本（TWD）
  currentPrice?: number;
  currentValue?: number;
  gain?: number;
  gainPercent?: number;
  expenseRatio?: number;
}

// 聚合後的持股（同一標的多批次合併）
export interface AggregatedHolding extends HoldingWithQuote {
  lots: HoldingWithQuote[];  // 個別批次明細
}

// API 回應格式
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
