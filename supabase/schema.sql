-- =============================================
-- Portfolio Visualizer - Supabase Schema
-- =============================================
-- 在 Supabase Dashboard > SQL Editor 中執行此腳本

-- Holdings Table（持股）
CREATE TABLE IF NOT EXISTS holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  shares DECIMAL(18, 8) NOT NULL,
  cost_price DECIMAL(18, 4) NOT NULL,
  purchase_date DATE NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'TW')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily Snapshots Table（每日快照）
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  total_value_twd DECIMAL(18, 2) NOT NULL,
  exchange_rate DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ETF Expense Ratios Table（ETF 費用率）
CREATE TABLE IF NOT EXISTS etf_expense_ratios (
  symbol TEXT PRIMARY KEY,
  expense_ratio DECIMAL(8, 6) NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON daily_snapshots(snapshot_date);

-- Enable Row Level Security (但允許所有操作，因為是單用戶應用)
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE etf_expense_ratios ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (單用戶不需複雜權限)
CREATE POLICY "Allow all operations on holdings" ON holdings FOR ALL USING (true);
CREATE POLICY "Allow all operations on daily_snapshots" ON daily_snapshots FOR ALL USING (true);
CREATE POLICY "Allow all operations on etf_expense_ratios" ON etf_expense_ratios FOR ALL USING (true);
