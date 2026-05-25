-- =============================================
-- Transactions Table（交易紀錄）
-- =============================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  shares DECIMAL(18, 8) NOT NULL,
  price DECIMAL(18, 4) NOT NULL,
  transaction_date DATE NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'TW')),
  realized_pnl_twd DECIMAL(18, 2),
  holding_id UUID,
  portfolio_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id);

-- 啟用 RLS：不建任何 policy（RLS on + 無 policy = 預設拒絕）。
-- app 一律走 service_role，service_role 不受 RLS 限制，故無需寬鬆 policy。
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Data API：僅開放 service_role，刻意不給 anon/authenticated。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO service_role;
