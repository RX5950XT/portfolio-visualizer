# AGENTS.md — Portfolio Visualizer 協作規範

> 本檔為各 AI agent 的專案通用規範，與 `CLAUDE.md` 對齊。
> `CLAUDE.md` 為完整開發指南；兩者衝突時以 `CLAUDE.md` 為準。

## 語言
- 一律繁體中文（臺灣用語）回答，技術術語可保留英文；回覆精簡、只講結果。

## 專案
- Portfolio Visualizer：單人使用的台美股投資組合視覺化工具。
- 技術：Next.js 16（App Router）+ TypeScript + Tailwind CSS v4 + Supabase + Recharts + Vercel；AI 健診走 OpenRouter。
- 已完成進階功能：S&P 500 對照、進階績效指標（XIRR/回撤/波動率/Sharpe/勝率）、配息追蹤（`/dividends`）、配置透視/ETF 穿透（`/insights`）、AI 健診（`/insights` + `/settings`）。

## 核心原則
- 好品味、不破壞用戶行為、實用主義、簡潔執念（詳見 CLAUDE.md「AI 協作哲學」）。
- 改動最小化、找根因不打補丁；每次修改後自行驗證到通過再回報。

## 程式碼規範
- TypeScript strict、明確回傳型別、避免 `any`。
- App Router、優先 Server Components、Client 元件以 `'use client'` 開頭、元件檔名 PascalCase。
- 純深色主題；漲 `#22c55e`、跌 `#ef4444`。
- API 回傳格式 `{ data } | { error }`；路徑 `/api/[resource]/route.ts`。
- 函式 < 50 行、檔案 < 800 行、巢狀 ≤ 4；只寫解釋「為什麼」的繁中註釋。
- 股票代號：美股大寫（`AAPL`/`VOO`）、台股上市（`2330.TW`）、上櫃（`6547.TWO`）；美股以 USD 存、顯示轉 TWD。

## 資料庫與安全（鐵則）
- 資料表**只 GRANT `service_role`**，不給 `anon`/`authenticated`；前端不直連 Supabase，一律經 `createServerClient`。
- RLS 啟用但**禁用 `USING(true)`**；不開放就不建 policy（on + 無 policy = 預設拒絕）。
- 新表上線：用 anon key 打 `GET /rest/v1/<table>` **必須回 401** 才算安全。
- OpenRouter Key 存 `app_settings`（僅 service_role）、遮罩、永不回前端；secrets 一律環境變數或 DB，不硬編碼，`.env*` 不進 git。
- 認證走 HMAC 簽章 cookie；寫入端點 `requireAdmin()`，讀取端點套訪客可見性過濾。

## Git
- Commit 格式 `<type>: <description>`（type：feat/fix/refactor/docs/test/chore/perf/ci）。
- Commit / push 僅在使用者要求時執行。

## 完成前驗證
- `npm run build`（零 TS 錯誤）、`npm run lint`、375px 響應式正常、深色主題一致、API 格式正確。
