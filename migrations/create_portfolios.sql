-- 建立 portfolios 表格
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '新的投資組合',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 新增 portfolio_id 欄位到 holdings 表格
ALTER TABLE holdings
ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE;

-- 新增 portfolio_id 欄位到 cash_balance 表格
ALTER TABLE cash_balance
ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE;

-- 建立預設投資組合並遷移現有資料
DO $$
DECLARE
  default_portfolio_id UUID;
BEGIN
  -- 檢查是否已有預設組合
  SELECT id INTO default_portfolio_id FROM portfolios WHERE is_default = TRUE LIMIT 1;
  
  -- 如果沒有預設組合，建立一個
  IF default_portfolio_id IS NULL THEN
    INSERT INTO portfolios (name, is_default)
    VALUES ('我的投資組合', TRUE)
    RETURNING id INTO default_portfolio_id;
  END IF;
  
  -- 遷移沒有 portfolio_id 的 holdings
  UPDATE holdings
  SET portfolio_id = default_portfolio_id
  WHERE portfolio_id IS NULL;
  
  -- 遷移沒有 portfolio_id 的 cash_balance
  UPDATE cash_balance
  SET portfolio_id = default_portfolio_id
  WHERE portfolio_id IS NULL;
END $$;
