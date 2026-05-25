-- 應用設定表（目前存放 AI 顧問的 OpenRouter 設定）
-- Why: API Key 屬敏感資料，刻意「只」授權 service_role，不開放 anon/authenticated；
--      應用一律透過伺服器端 service_role 存取（lib/supabase.createServerClient），
--      故啟用 RLS 但不建立給 anon 的寬鬆 policy，避免 Data API 直接讀出金鑰。

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO service_role;
