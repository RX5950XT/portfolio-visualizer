-- Demo 沙盒空間：每個 demo session 一個隨機 demo_space，真實資料為 NULL
--
-- 隔離契約：admin/guest 一律查 demo_space IS NULL、demo 查 demo_space = <本 session>。
-- 由 lib/auth.scopeQuery 統一套用；[id] 寫入因此安全 by construction
-- （demo 改到真實資料的 row 會匹配 0 筆而無效）。

ALTER TABLE portfolios   ADD COLUMN IF NOT EXISTS demo_space TEXT;
ALTER TABLE holdings     ADD COLUMN IF NOT EXISTS demo_space TEXT;
ALTER TABLE cash_balance ADD COLUMN IF NOT EXISTS demo_space TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS demo_space TEXT;

-- Partial index：只索引 demo 列，過期清理掃描用（真實資料量不受影響）
CREATE INDEX IF NOT EXISTS idx_portfolios_demo_space
  ON portfolios(demo_space) WHERE demo_space IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_holdings_demo_space
  ON holdings(demo_space) WHERE demo_space IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_balance_demo_space
  ON cash_balance(demo_space) WHERE demo_space IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_demo_space
  ON transactions(demo_space) WHERE demo_space IS NOT NULL;

-- GRANT 不變：4 表既有授權皆只給 service_role，demo 同樣經伺服器端存取。
