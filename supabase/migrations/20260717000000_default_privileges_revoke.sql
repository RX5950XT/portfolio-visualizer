-- 縱深防禦（系統性）：撤銷 schema public 的 default privileges，
-- 使「未來」新建的表/序列/函式天生不帶 anon/authenticated 權限。
--
-- Why: Supabase 專案預設 `ALTER DEFAULT PRIVILEGES FOR ROLE postgres ... GRANT ALL TO anon, authenticated`，
--      故每張新表一建立就對公開 anon key 開放完整 CRUD，過去只能靠「每張表都記得手動 REVOKE + ENABLE RLS」撐住，
--      漏一步就是外洩開口（本專案曾因此發生 CRITICAL，見 20260526000000_revoke_anon_data_access.sql）。
--      本設定只影響未來新物件，不改動既有表（既有表已逐表 REVOKE），故套用零風險、app 行為不變。
--      驗收：套用後新建任一表，用 anon key 打 GET /rest/v1/<新表> 應回 401 而非 200。
--
-- 此檔為 schema 層級（不參照任何資料表），故在全新專案上以 supabase db push 亦可獨立套用、不受建表順序影響。

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
