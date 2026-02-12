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

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on transactions" ON transactions FOR ALL USING (true);
