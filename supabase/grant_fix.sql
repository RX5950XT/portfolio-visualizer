-- Supabase Data API GRANT 補充（2026-05-30 政策變更前置作業）
-- 已在 migrations/ 與 schema.sql 中追加，此處對現有表格執行

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_balance TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_snapshots TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etf_expense_ratios TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO anon, authenticated, service_role;
