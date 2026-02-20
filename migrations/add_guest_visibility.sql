-- 新增訪客可見性欄位（預設所有組合對訪客可見）
ALTER TABLE portfolios
ADD COLUMN IF NOT EXISTS visible_to_guest BOOLEAN DEFAULT TRUE;
