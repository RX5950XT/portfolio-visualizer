# Lessons

## 2026-05-26 — Supabase anon GRANT + RLS USING(true) = 門戶大開（CRITICAL）

**事發**：6 張資料表（holdings/transactions/portfolios/cash_balance/daily_snapshots/etf_expense_ratios）
被 `GRANT ALL ... TO anon` 且 RLS policy 為 `USING(true)`。anon key 是公開金鑰，
任何未登入者可直接打 REST Data API 讀寫刪全部個人財務資料，app 的密碼登入完全被繞過。
已實證：未登入 anon `GET /rest/v1/holdings` 回 200 + 真實持股。

**根因**：誤把「GRANT 給 anon + USING(true)」當成「讓 Data API 能用」的標準作法。
實際上本 app 全程只用 `createServerClient()`（service_role），`getSupabase()`（anon）從未被引用，
anon 權限是「完全未使用」且致命的開口。

**修正**：`migrations/20260525_revoke_anon_data_access.sql`
→ `REVOKE ALL ... FROM anon, authenticated` + DROP 那些 `USING(true)` policy，只留 service_role。

**規則（往後一律遵守）**：
1. 只走 service_role 的後端 app，資料表**絕不** GRANT 給 anon/authenticated。
2. RLS policy 嚴禁 `USING(true)`；沒有要開放就不要建 policy（RLS on + 無 policy = 預設拒絕）。
3. 新表上線後，務必用 anon key 實打 `GET /rest/v1/<table>`，**必須**回 401，才算安全。
4. CLAUDE.md 的「GRANT 是通行證、RLS 才是控制」只適用於前端直連 anon 的架構；
   本 app 不是那種架構，正解是「兩者都不給 anon」。
5. `app_settings`（含 OpenRouter key）是唯一做對的範本：只 GRANT service_role + RLS on 無 policy。

## 2026-07-16 — Vercel env var 兩個雷：部署後才注入 + PowerShell pipe 帶 CRLF

**事發**：Demo 空間上線後正式站登入 `demo` 一直 401。先發現 `DEMO_PASSWORD` 加在「已部署」之後不生效；
改用 PowerShell pipe（`'demo' | vercel env add ...`）補上後仍 401。

**根因**：
1. Vercel 環境變數在**建立部署當下**注入 runtime；事後改 env **必須重新部署**才會進到跑中的 function。
2. PowerShell 對 pipe 預設用 CRLF，`'demo' | vercel env add` 實際存進去是 `demo\r\n`。
   `timingSafeEqual` 長度不符 → 永遠比對失敗。

**修正**：用 `vercel env add X <env> --value <v> --yes`（不要 pipe）；加完 env 後 `vercel redeploy`；
本輪起 Demo 改為公開常數 `demo` + DB 開關，不再依賴 `DEMO_PASSWORD` env。

**規則（往後一律遵守）**：
1. 加／改／刪 Vercel env 後**一定重新部署**（`vercel redeploy <url>` 或新 push）。
2. 設 env 值一律 `vercel env add NAME env --value VALUE --yes`，**絕不用 pipe**。
3. 懷疑髒字元時用 `vercel env pull` 再以能顯示控制字元的方式檢查實際位元組（勿只看 Dashboard 顯示）。

## 2026-07-09 — `next build` 與 `next dev` 共用 `.next`，造成瀏覽器狂 reload（F5 loop）


**事發**：驗證新功能時，在 `npm run dev` 仍在跑的情況下又跑了 `npm run build`。`next build` 重寫了
`.next/`，把運行中的 Turbopack dev server 快取洗壞 → 每次請求 `/` 都噴 `FATAL ... Next.js package not found`
panic → HMR 觸發全頁 reload → 使用者看到瀏覽器**無限 F5**。

**根因**：`next dev` 與 `next build` 共用同一個 `.next/` 工作目錄，並行會互相破壞。與埠號/多專案無關
（當時 3000 埠是另一個專案 PCPriceProxy，不相干）。

**修正**：`taskkill` 掉 dev server → `rm -rf .next` → 重新 `npm run dev`。重啟後 FATAL=0、`/` 穩定 200。

**規則（往後一律遵守）**：
1. **dev server 運行期間絕不跑 `next build`**。要做 build 驗證就先停 dev，或反過來先 build 完再開 dev。
2. 驗證 API/功能優先用「開著的 dev server + curl」，不要另外 build。
3. 出現 Turbopack panic / 狂 reload，第一步就是 `rm -rf .next` 後重啟，先排除快取污染再查程式碼。
4. 背景啟動 dev server 前，先確認沒有殘留的舊 dev 進程共用 `.next`。
