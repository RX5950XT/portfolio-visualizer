# Demo 沙盒空間 — 設計文件

日期：2026-07-16
狀態：待實作

## 目標

在現有 `admin` / `guest` 兩種角色之外，開一個**完全獨立、可自由編輯**的 Demo 空間：任何人輸入密碼 `demo` 即進入，能自由增刪改投資組合、持股、交易來體驗網站，且**永遠碰不到管理員的真實資料**。

## 需求決策（已與使用者確認）

| 項目 | 決策 |
|---|---|
| 隔離粒度 | 每個訪客各自獨立沙盒（per-visitor），互不干擾 |
| 隔離架構 | 單一 Supabase + 資料表加 `demo_space` 欄位 |
| 種子資料 | 固定模板：一年前各投入 NT$50 萬買 VT 與 0050.TW |
| 歷史淨值曲線 | 靠回溯買入日自動回填（曲線本就從最早買入日即時回推，不依賴 `daily_snapshots`；已驗證三個 charts route 均不讀該表） |
| AI 健診 | Demo 停用 |
| 資料壽命 | 每個 demo 沙盒存活 24 小時；**demo token/cookie 壽命同步設 24h**（admin/guest 維持 7 天），避免 cookie 還活著但資料已被清 |

## 核心機制

Demo 是第三種角色，登入時產生一個**隨機 `demo_space` id 並簽進 cookie**。4 張與投資組合相關的資料表各加一個 `demo_space TEXT`（可為 NULL），用一條 uniform 述詞做隔離：

| 角色 | 資料述詞 | 寫入 |
|---|---|---|
| admin | `demo_space IS NULL` | ✅ 真實資料 |
| guest | `demo_space IS NULL` + 現有 `visible_to_guest` | ❌ 唯讀 |
| demo | `demo_space = <本 session>` | ✅ 只碰自己沙盒 |

**安全 by construction**：`[id]` 端點的更新/刪除一律附帶述詞，例如 demo 改到管理員的 row 時
`.eq('id', id).eq('demo_space', space)` 匹配 0 筆、自然無效，不需另外查歸屬。真實資料（`demo_space IS NULL`）永遠不會被 demo 的述詞（`= space`）命中。

## 資料模型

新增 migration `migrations/20260716_demo_space.sql`：

```sql
ALTER TABLE portfolios    ADD COLUMN IF NOT EXISTS demo_space TEXT;
ALTER TABLE holdings      ADD COLUMN IF NOT EXISTS demo_space TEXT;
ALTER TABLE cash_balance  ADD COLUMN IF NOT EXISTS demo_space TEXT;
ALTER TABLE transactions  ADD COLUMN IF NOT EXISTS demo_space TEXT;

-- 清理掃描用（只查 demo 列）
CREATE INDEX IF NOT EXISTS idx_portfolios_demo_space ON portfolios(demo_space) WHERE demo_space IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_demo_space ON transactions(demo_space) WHERE demo_space IS NOT NULL;
```

- 不動 `daily_snapshots`（全域、demo 不寫）、`etf_expense_ratios`（全域參考，demo 唯讀 VT/0050 費用率）、`app_settings`（AI 金鑰，demo 不可觸及）。
- GRANT 不變（既有 4 表已只授 `service_role`）。

## 認證層

### `lib/auth-token.ts`
- `UserRole` 擴充為 `'admin' | 'guest' | 'demo'`。
- Token 格式：admin/guest 維持 `<role>.<exp>.<sig>`（3 段）；demo 為 `demo.<space>.<exp>.<sig>`（4 段）。
- 新增 `Session = { role: UserRole; demoSpace: string | null }`。
- `createAuthToken(role, demoSpace?)`：demo 時把 `space` 納入簽章負載，且 **exp 用 24h**（`DEMO_MAX_AGE_SECONDS`）；admin/guest 維持 7 天。
- `verifyAuthToken(token)` 回傳 `Session | null`（原本回 `UserRole`）；驗章、驗期不變；demo 需 4 段且 space 非空。
- `demoSpace` 進簽章 → 不可偽造他人沙盒。

### `lib/auth.ts`
- `getSession(): Promise<Session | null>` —— 取代直接用 `getUserRole` 的地方；保留 `getUserRole()` 回傳 `role` 以相容既有 caller。
- `verifyPassword()`：新增比對 `DEMO_PASSWORD` → 回 `'demo'`（沿用 `timingSafeEqual`）。
- `setAuthCookie(role, demoSpace?)`：demo 的 cookie maxAge 同步 24h。
- `getVisiblePortfolioIdsForRole`：admin→`null`、demo→`null`（demo 靠 `scopeQuery` 述詞，不需 id 清單）、guest→維持現有可見 id 清單，**且查詢須加 `.is('demo_space', null)`** —— demo 新建組合時 `visible_to_guest` 預設 TRUE，否則 guest 的可見清單會被 demo 組合 id 汙染（根因在查詢沒過濾，不是欄位預設值）。
- 新增集中 helper（隔離的唯一真相來源，避免每個 route 手寫忘記）：
  - `scopeQuery(query, session)`：對 SELECT/UPDATE/DELETE query builder 追加述詞 —— admin/guest → `.is('demo_space', null)`；demo → `.eq('demo_space', space)`。
  - `stampSpace(session)`：回傳要併入 INSERT 的欄位 —— demo → `{ demo_space: space }`；admin → `{}`（NULL）。
  - `requireWriteAccess(session)`：放行 `admin` 與 `demo`，`guest`／未登入回 403。取代寫入端的 `requireAdmin()`。

### `middleware.ts`
- 改用回傳 `Session` 的 `verifyAuthToken`；邏輯不變（有效 session 即放行，含 demo）。

## API 端點改動

**寫入端**（`requireAdmin()` → `requireWriteAccess(session)`，INSERT 併入 `stampSpace`，UPDATE/DELETE 套 `scopeQuery`）：
- `portfolios` POST、`portfolios/[id]` PUT/DELETE
  - **⚠ `portfolios/[id]` DELETE 內含三個 delete**（holdings by portfolio_id、cash_balance by portfolio_id、portfolio 本身）——**每一個都要套 `scopeQuery`**。只套最後一個的話，demo 傳 admin 組合 id 可刪掉 admin 的持股與現金。全案最危險的一處。
- `holdings` POST、`holdings/[id]` PUT/DELETE
- `transactions` POST（賣出：`holdings` 查批次、`cash_balance` 查/改都要 `scopeQuery`；**demo 時忽略 `body.portfolio_id`，一律用 `lots[0].portfolio_id`**，避免把任意組合 id 寫進 tx row）、`transactions/[id]`
- `cash` PUT

**讀取端**（每個 SELECT 套 `scopeQuery`；guest 既有 `visibleIds` 邏輯保留）：
- `portfolios` GET、`portfolios/[id]` GET
- `holdings` GET、`cash` GET、`transactions` GET、`dividends` GET（讀 holdings + transactions，漏掉會讓 demo 看到管理員配息資料）
- `charts/*`（metrics、daily-pnl、asset-trend）、`insights/lookthrough`

**維持 `requireAdmin()`（demo 自動被擋 = AI/設定停用，零成本）**：
- `settings` GET/PUT、`ai/models`、`ai/advisor`

## 種子（demo 登入時）

新增 `lib/demo-seed.ts`：

1. `sweepExpiredDemo()`：**以 space 為單位清理** —— 先撈過期 space id（`SELECT DISTINCT demo_space FROM portfolios WHERE demo_space IS NOT NULL AND created_at < now()-24h`），再對 4 張表 `DELETE WHERE demo_space IN (...)` 一次清乾淨。
   - Why：若靠 FK cascade + transactions 自身 `created_at` 判齡，會留下「space 已死但 tx 未滿 24h」的暫時孤兒；且 demo 用戶把組合全刪光後，該 space 無 portfolio 可判齡。space-based 沒有這兩個洞。
2. `seedDemoSpace(space)`：
   - 建 portfolio `{ name: 'Demo 示範組合', demo_space: space, visible_to_guest: false }`。
   - 回溯買入日 `backdate`（今天 −365 天）；若非交易日，取 ≥ `backdate` 的**第一個交易日**收盤價。
   - 種子數學（一致的故事：「一年前各投入 NT$50 萬」）：`shares = 500,000 ÷ backdate 收盤價`、`cost_price = backdate 收盤價`。0050.TW 股數捨去到整股（較真實），VT 保留分數股。
   - 寫 2 筆 holdings：`{ symbol, shares, cost_price, purchase_date: backdate, market, portfolio_id, demo_space: space }`。
   - `cash_balance` 起始 0。
   - **Fallback**：任何 Yahoo 抓價失敗 → 用寫死的合理價，確保登入不被外部 API 卡住。

`app/api/auth/route.ts` POST：`role === 'demo'` 時 → `sweepExpiredDemo()` → 產生 `space`（`crypto.randomUUID()`）→ `seedDemoSpace(space)` → `setAuthCookie('demo', space)`。

## 前端

角色來自現有 `/api/auth/me`（回 `role`，demoSpace 不外流）。目前 4 頁用 `isAdmin = role === 'admin'` 同時擋「資料編輯」與「AI/設定」。需拆分：

- 新增 `canEdit = role === 'admin' || role === 'demo'`。
- `dashboard`、`transactions`：編輯類 UI 改用 `canEdit`。
- `insights` 的 AI 卡片、`settings`：維持嚴格 `isAdmin`（demo 不得使用；settings 既有非 admin 導離邏輯已擋掉 demo）。
- `role === 'demo'` 時顯示「Demo 模式，資料僅供體驗、24 小時後重置」橫幅。

## 文件同步

- README 補：`DEMO_PASSWORD` 環境變數說明、新 migration（`20260716_demo_space.sql`）與執行順序。

## 已知限制

- Demo 沙盒與 demo cookie 皆為 24 小時（設計如此，兩者同步）。
- Demo 不提供 AI 健診、不可改系統設定。
- 種子抓價需連 Yahoo；失敗時退回固定價，曲線起點價格可能與真實歷史略有出入。
- 既有怪癖（不在本次範圍）：組合全刪光時 portfolios GET 回假的 `{id:'default'}`，後續帶 `'default'` 打 API 會 UUID cast 錯誤；admin 原本就有此行為，demo 較易踩到。

## 驗證

- `npm run build` 零 TS 錯誤、`npm run lint`。
- 安全：以 anon key 打 `GET /rest/v1/portfolios` 仍須 401。
- 手動：admin 登入看不到任何 demo 資料；demo 登入看到 VT/0050 種子且有回溯曲線；demo 增刪改後 admin 資料不變；兩個 demo session 互看不到對方；demo 打寫入端點帶 admin 的 row id → 無效；**demo 打 `DELETE /api/portfolios/<admin組合id>` 後，admin 的 holdings/cash 完好**；guest 登入的可見組合清單不含 demo 組合。
