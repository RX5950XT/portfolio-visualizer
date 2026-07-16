# CLAUDE.md — Portfolio Visualizer 專案規範

> 本檔與 `AGENTS.md` 內容一致，皆為專案規範。設定與初始化細節（環境變數、migration 順序）見 `README.md`。

一律繁體中文（臺灣用語）回答，技術術語可保留英文；回覆精簡、只講結果。

## 專案
- Portfolio Visualizer：單人使用的台美股投資組合視覺化工具。
- 技術：Next.js 16（App Router）+ TypeScript + Tailwind CSS v4 + Supabase + Recharts + Vercel；AI 健診走 OpenRouter。

## 核心原則
- 好品味、不破壞用戶行為、實用主義、簡潔執念。
- 改動最小化、找根因不打補丁；每次修改後自行驗證到通過再回報。

## 程式碼規範
- TypeScript strict、明確回傳型別、避免 `any`。
- App Router、優先 Server Components、Client 元件 `'use client'`、元件檔名 PascalCase。
- 純深色主題（背景 `#000`/`#0a0a0a`）；漲 `#22c55e`、跌 `#ef4444`。
- API 回傳 `{ data } | { error }`；路徑 `/api/[resource]/route.ts`。
- 函式 < 50 行、檔案 < 800 行、巢狀 ≤ 4；不靜默吞例外、不可變資料優先。
- 只寫解釋「為什麼」的繁中註釋，禁止描述「做什麼」的廢話註釋。
- 股票代號：美股大寫（`AAPL`/`VOO`）、台股上市（`2330.TW`）、上櫃（`6547.TWO`）；美股以 USD 存、顯示轉 TWD。

## 資料庫與安全（鐵則）
- 資料表**只 GRANT `service_role`**，不給 `anon`/`authenticated`；前端不直連 Supabase，一律經 `lib/supabase.createServerClient`。
- RLS 啟用但**禁用 `USING(true)`**；不開放就不建 policy（RLS on + 無 policy = 預設拒絕）。
- 新表上線：用 anon key 打 `GET /rest/v1/<table>` **必須回 401** 才算安全。
- OpenRouter Key 存 `app_settings`（僅 service_role）、遮罩、永不回前端；secrets 一律環境變數或 DB，不硬編碼，`.env*` 不進 git。
- 認證走 HMAC 簽章 cookie；三種角色 `admin`／`guest`／`demo`。寫入端點 `requireWriteSession()`（放行 admin/demo、擋 guest），讀取端點套訪客可見性過濾；AI 與設定端點維持 admin 專屬。
- **Demo 沙盒鐵則**：`portfolios`/`holdings`/`cash_balance`/`transactions` 帶 `demo_space`（真實資料為 NULL）。
  這 4 表的每個 SELECT/UPDATE/DELETE **一律經 `scopeQuery(query, session)`**、每個 INSERT **一律併入 `stampSpace(session)`**——這是隔離的唯一真相來源，漏一處就是資料外洩或誤刪。
  多個 delete 的端點（如 `portfolios/[id]` DELETE）**每一個 delete 都要套**。

## Git
- Commit 格式 `<type>: <description>`（type：feat/fix/refactor/docs/test/chore/perf/ci）。
- Commit / push 僅在使用者要求時執行。

## 完成前驗證
- `npm run build`（零 TS 錯誤）、`npm run lint`、375px 響應式正常、深色主題一致、API 格式正確。
