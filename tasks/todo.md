# 任務：Demo 沙盒空間

Spec：`docs/superpowers/specs/2026-07-16-demo-space-design.md`

## 1. 資料層
- [x] `migrations/20260716_demo_space.sql`：4 表加 `demo_space` + 4 個 partial index（已套用至 prod）

## 2. 認證層
- [x] `lib/auth-token.ts`：`Session` 型別、`demo` 角色、4 段 token、demo 24h exp
- [x] `lib/auth.ts`：`getSession`、`verifyPassword`(+DEMO_PASSWORD)、`setAuthCookie`(demo 24h)、
      `getVisiblePortfolioIdsForRole(session)`(+guest 加 `.is('demo_space', null)`)、
      `scopeQuery`、`stampSpace`、`requireWriteSession`
- [x] `middleware.ts`：改用回傳 Session 的 `verifyAuthToken`

## 3. 種子與清理
- [x] `lib/demo-seed.ts`：`sweepExpiredDemo()`（space 為單位）、`seedDemoSpace()`（VT/0050 各 50 萬、回溯一年）
- [x] `app/api/auth/route.ts`：demo 登入 → sweep → 產 space → seed → 設 24h cookie

## 4. API 端點
- [x] `portfolios/route.ts` GET/POST
- [x] `portfolios/[id]/route.ts` GET/PUT/**DELETE（三個 delete 全都套了 scopeQuery）**
- [x] `holdings/route.ts` GET/POST
- [x] `holdings/[id]/route.ts` PUT/DELETE
- [x] `transactions/route.ts` GET/POST（賣出：holdings/cash 子查詢全掃 + demo 忽略 body.portfolio_id）
- [x] `transactions/[id]/route.ts` PATCH/DELETE
- [x] `cash/route.ts` GET/PUT
- [x] `dividends/route.ts` GET
- [x] `charts/metrics`、`charts/daily-pnl`、`charts/asset-trend` GET
- [x] `insights/lookthrough` GET
- [x] `lib/portfolio-context.ts` + `ai/advisor`：加 session 參數並掃描
      （spec 外追加：admin AI 健診原本會混入 demo 資料）

## 5. 前端
- [x] `dashboard`：角色型別加 `demo`、編輯 UI 改用 `canEdit`（設定按鈕仍嚴格 `isAdmin`）
- [x] `transactions`：同上
- [x] `insights`：AI 卡片維持 `isAdmin`
- [x] Demo 模式橫幅

## 6. 文件與驗證
- [x] README 補 `DEMO_PASSWORD`、migration、RBAC 與安全說明；`.env.example` 同步
- [x] `CLAUDE.md` / `AGENTS.md` 同步（`requireAdmin` → `requireWriteSession` + demo 沙盒鐵則）
- [x] `npm run build` 成功 + `npm run lint` 0 errors
- [x] 端對端驗證（見下方 Review）

## Review

### 實作結果
Demo = 第三角色，登入時產生隨機 `demo_space` 簽進 cookie；4 張表加 `demo_space` 欄位，
由 `scopeQuery`/`stampSpace` 統一套述詞達成隔離。共改 20 個檔案、新增 2 個。

### 端對端驗證實測（dev server + 真實 Supabase）
- demo 登入 → 種子正確：`0050.TW` 9920 股 × 50.4 = 499,968；`VT` 131.505 股 × 129.32 × FX29.4 ≈ 50 萬
- 淨值曲線 366 點，起點 2025-07-16 市值=成本=999,968（正好一年前投入 100 萬），
  Total 報酬 72.21% = XIRR（單筆進場，數學上本應相等），最大回撤 -8.49% 且 15 天回復 → 真實歷史
- 兩個 demo session 拿到不同組合、互不可見
- **攻擊測試（用拋棄式測試組合，不拿真實資料冒險）**：
  - demo 刪 admin 組合（含三個 delete）→ admin 持股與組合完好
  - demo 用 id 改 admin 持股 → 失敗，內容不變
  - demo 用 id 刪 admin 持股 → 0 筆匹配，持股仍在
- admin 視角：4 組合 / 25 持股，`demo_space` 非 NULL 者 = 0；看不到 Demo 示範組合
- guest 視角：0 筆 demo 資料；寫入 → 403
- demo 正向：新增持股 / 改現金 / 建組合皆成功且自動帶 `demo_space`
- AI 三端點對 demo 皆 403（`advisor` / `settings` / `models`）
- 測試資料已全數清除，真實資料完好（4 組合 / 33 持股 / 22 交易）

### 過程中的修正
1. `scopeQuery` 泛型三次才對：遞迴約束與 polymorphic `this` 都讓 TS 對
   `PostgrestFilterBuilder` 展開失控（TS2589）。最終用不受約束泛型 + 內部收斂轉型。
2. **spec 漏網**：`lib/portfolio-context.ts` 查 holdings/cash 不過濾，
   admin 的 AI 健診會把 demo 資料混進分析 → 已加 session 參數並掃描。
3. dashboard 的 `isAdmin` 混用了兩種語意（設定按鈕 vs 編輯 UI），已拆成 `isAdmin` / `canEdit`。

### 限制
- demo 沙盒與 cookie 皆 24h（兩者同步，不會出現 cookie 有效但資料被清的空站）。
- 清理為 sweep-on-login；demo 流量變大再改 cron。
- 種子在**進場當下**為 50/50；因兩者一年來績效不同，今日看到的配置會偏移（實測約 62/38）。
  這是真實漂移、非 bug；若要「今日剛好 50/50」需改用現價反推股數（成本腿會不等額）。
- 既有怪癖（未修）：組合全刪光時 portfolios GET 回假的 `{id:'default'}`，
  後續帶 `'default'` 打 API 會 UUID cast 錯誤；admin 原本就有此行為，demo 較易踩到。
