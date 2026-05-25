-- 安全修補（CRITICAL）：撤銷 anon / authenticated 對所有資料表的 Data API 權限
--
-- 問題：先前 migration 對 6 張資料表 GRANT 完整 CRUD 給 anon，且 RLS policy 為 USING(true)。
--       anon key 是設計上可公開的金鑰（NEXT_PUBLIC_），任何人拿到專案 URL + anon key，
--       即可直接呼叫 Supabase REST Data API 讀取、竄改、刪除全部投資組合資料，
--       完全繞過 app 的密碼登入與訪客可見性過濾。密碼門形同虛設。
--
-- 事實：全 app 僅透過 createServerClient()（service_role）存取資料庫；
--       anon client（lib/supabase.getSupabase）從未被任何程式碼引用。
--       因此 anon / authenticated 的 GRANT 是「完全未使用」且危險的開口。
--
-- 修補：撤銷 anon / authenticated 權限，僅保留 service_role（它本就 bypass RLS）。
--       app 行為零影響；存取控制回歸由伺服器端密碼登入把關。

REVOKE ALL PRIVILEGES ON public.portfolios FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.holdings FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.transactions FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.cash_balance FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.daily_snapshots FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.etf_expense_ratios FROM anon, authenticated;

-- app_settings（內含 OpenRouter API Key）：實測 anon 仍能觸及此表（回 200 而非 401），
-- 目前僅靠「RLS 無 anon policy → 回空」擋住金鑰。明確 REVOKE 改為縱深防禦，不再單靠 RLS 擋空。
REVOKE ALL PRIVILEGES ON public.app_settings FROM anon, authenticated;

-- 同時收掉寬鬆的 RLS policy（USING(true)）。service_role 不受 RLS 影響，故移除後 app 仍正常；
-- 移除後即使日後誤 GRANT 給 anon，也不會立即門戶大開。
DROP POLICY IF EXISTS "Allow all operations on portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Allow all operations on holdings" ON public.holdings;
DROP POLICY IF EXISTS "Allow all operations on transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow all operations on cash_balance" ON public.cash_balance;
DROP POLICY IF EXISTS "Allow all operations on daily_snapshots" ON public.daily_snapshots;
DROP POLICY IF EXISTS "Allow all operations on etf_expense_ratios" ON public.etf_expense_ratios;

-- RLS 維持啟用（縱深防禦）；資料存取一律經 service_role。
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etf_expense_ratios ENABLE ROW LEVEL SECURITY;
