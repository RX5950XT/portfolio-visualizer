-- =============================================
-- Portfolio Visualizer - Supabase Schema
-- =============================================
-- 在 Supabase Dashboard > SQL Editor 中執行此腳本

-- Cash Balance Table（現金餘額）
CREATE TABLE IF NOT EXISTS cash_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_twd DECIMAL(18, 2) NOT NULL DEFAULT 0,
  portfolio_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
CREATE INDEX IF NOT EXISTS idx_cash_portfolio ON cash_balance(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON daily_snapshots(snapshot_date);

-- 啟用 RLS：不建任何 policy（RLS on + 無 policy = 預設拒絕）。
-- 本 app 一律走伺服器端 service_role（不受 RLS 限制），故無需寬鬆 policy。
-- 切勿改成 USING(true) 或 GRANT 給 anon——那會讓未登入者用公開 anon key 直接讀寫資料。
ALTER TABLE cash_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE etf_expense_ratios ENABLE ROW LEVEL SECURITY;

-- Data API：僅開放 service_role，刻意不給 anon/authenticated。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_balance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etf_expense_ratios TO service_role;
