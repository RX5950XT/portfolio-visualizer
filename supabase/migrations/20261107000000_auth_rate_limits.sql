-- 登入與 Demo 進入次數限制
--
-- Why: Serverless 各實例不共享記憶體，計數必須放資料庫；且要在同一個 SQL 語句內原子加一，
--      否則併發請求可以同時讀到舊值而繞過上限。
-- key 為 HMAC 後的值（見 lib/rate-limit.ts），資料庫不留原始 IP 與帳號。

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window
  ON public.auth_rate_limits(window_started_at);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_rate_limits TO service_role;

-- 回傳值：0 = 放行；大於 0 = 已超過上限，還要等幾秒。
CREATE OR REPLACE FUNCTION public.auth_rate_limit_hit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_window INTERVAL := make_interval(secs => p_window_seconds);
  v_hits INTEGER;
  v_started TIMESTAMPTZ;
BEGIN
  INSERT INTO public.auth_rate_limits AS r (key, hits, window_started_at)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE WHEN r.window_started_at <= now() - v_window THEN 1 ELSE r.hits + 1 END,
    window_started_at = CASE WHEN r.window_started_at <= now() - v_window THEN now() ELSE r.window_started_at END
  RETURNING hits, window_started_at INTO v_hits, v_started;

  -- 偶爾順手清掉過期列，不必另外排程；最長的時間窗是 1 小時。
  IF random() < 0.01 THEN
    DELETE FROM public.auth_rate_limits WHERE window_started_at < now() - INTERVAL '1 day';
  END IF;

  IF v_hits > p_limit THEN
    RETURN GREATEST(1, CEIL(EXTRACT(EPOCH FROM v_started + v_window - now()))::INTEGER);
  END IF;
  RETURN 0;
END;
$$;

-- 函式預設開放給 PUBLIC，必須明確收回。
REVOKE ALL ON FUNCTION public.auth_rate_limit_hit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_rate_limit_hit(TEXT, INTEGER, INTEGER) TO service_role;
