-- Supabase Data API 權限設定（修正版）
-- Why: 補齊 remote 缺漏的基礎表，並把存取權收斂為「僅 service_role」。
--      本 app 一律透過伺服器端 service_role 存取，刻意不開放 anon/authenticated；
--      RLS 啟用但不建立寬鬆 policy（on + 無 policy = 預設拒絕），避免未登入繞過密碼直讀資料。
-- 註：早期版本曾 GRANT 給 anon + 建立 USING(true) policy，已證實為 CRITICAL 外洩開口，
--     由 20260525_revoke_anon_data_access.sql 撤銷；此檔同步改為正確作法，重跑亦安全。

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

-- Data API：僅開放 service_role，刻意不給 anon/authenticated。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_balance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etf_expense_ratios TO service_role;
