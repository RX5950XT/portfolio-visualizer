-- Supabase Data API grant policy remediation
-- Why: 2026-05-30 起，public schema 新表若未明確 GRANT，將無法透過 Data API 存取。
-- 此 migration 也補齊 remote 缺漏的基礎表與 RLS/policy，確保既有專案可重複執行。

CREATE TABLE IF NOT EXISTS public.daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  total_value_twd DECIMAL(18, 2) NOT NULL,
  exchange_rate DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.etf_expense_ratios (
  symbol TEXT PRIMARY KEY,
  expense_ratio DECIMAL(8, 6) NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_date ON public.daily_snapshots(snapshot_date);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etf_expense_ratios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portfolios'
      AND policyname = 'Allow all operations on portfolios'
  ) THEN
    CREATE POLICY "Allow all operations on portfolios"
      ON public.portfolios
      FOR ALL
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cash_balance'
      AND policyname = 'Allow all operations on cash_balance'
  ) THEN
    CREATE POLICY "Allow all operations on cash_balance"
      ON public.cash_balance
      FOR ALL
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'holdings'
      AND policyname = 'Allow all operations on holdings'
  ) THEN
    CREATE POLICY "Allow all operations on holdings"
      ON public.holdings
      FOR ALL
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND policyname = 'Allow all operations on transactions'
  ) THEN
    CREATE POLICY "Allow all operations on transactions"
      ON public.transactions
      FOR ALL
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'daily_snapshots'
      AND policyname = 'Allow all operations on daily_snapshots'
  ) THEN
    CREATE POLICY "Allow all operations on daily_snapshots"
      ON public.daily_snapshots
      FOR ALL
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'etf_expense_ratios'
      AND policyname = 'Allow all operations on etf_expense_ratios'
  ) THEN
    CREATE POLICY "Allow all operations on etf_expense_ratios"
      ON public.etf_expense_ratios
      FOR ALL
      USING (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_balance TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_balance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_balance TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_snapshots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_snapshots TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.etf_expense_ratios TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etf_expense_ratios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etf_expense_ratios TO service_role;
