# portfolio-visualizer todo
最後更新：2026-11-19

## 現況（交接）
- 個人投資組合儀表板（Next.js 16 + Supabase）＋ Streamable HTTP MCP；功能、部署、MCP 用法與目錄見 `README.md`，安全與架構規範見 `AGENTS.md`。
- 網站與 MCP 共用同一份商業邏輯：交易寫入在 `lib/trades.ts`（新增、賣出、`updateHolding`、`setCash`），分析計算在 `lib/analytics/`；API route 只是薄包裝。改邏輯時兩邊一起受影響。
- 登入密碼存 `app_settings.auth_config`（scrypt）；env 只用於首次引導。Demo 帳密固定 `demo`，由開關控制，首頁 `force-dynamic` 才會即時反映開關。
- 安全修補（2026-11-07）已完成：登入與 Demo 次數限制（`lib/rate-limit.ts`、`auth_rate_limits`，已套正式庫）、改密碼用 `sessionsValidAfter` 撤銷舊憑證（由 token 到期回推簽發時間，不改 token 格式）、認證設定讀取失敗一律拋出（不退回 env、不開 Demo）、Demo 額度與輸入上限涵蓋無組合的沙盒。在 Docker 本機 Supabase 隔離實測 103 項，正式資料未被寫入。

## 關鍵決策
- MCP 金鑰可讀也可寫（新增、賣出、編輯持股、設定現金）；不能刪除、不能動組合／登入／MCP 設定、不能碰 Demo 沙盒。
- 新增持股與網站一致**不扣現金**；賣出依批次比例扣減，賣得金額加回現金。`holding_update` 只能改仍有剩餘股數的批次。
- 已實現總額先加總再四捨五入（原本逐筆四捨五入多 2 元）。
- AI 顧問／健診已移除（連同相關套件）；舊 `ai_config` 儲存值未刪除。
- `braces` 官方無修補版：Next ESLint 唯一 caller（`get-root-dirs.js` 的目錄 `globSync`）改由私有 workspace `tools/next-eslint-glob` 提供（超過 1000 路徑明確拒絕）；未關閉規則、未忽略 audit。`npm audit` 全等級 0。
- `.gitignore` 排除所有層級 `node_modules`（tools workspace 有巢狀依賴）。

## 驗證方式
- `npm test`、`npx tsc --noEmit`、`npm run lint`（0 error，既有 4～5 個 warning）、`npm run build`。
- UI／MCP 端對端腳本放 `output/verify-*.mjs`、`output/audit-mobile.mjs`（Edge，1440／375px）；寫入類測試用暫時組合，結束後刪資料並還原 MCP 金鑰設定，確認 4 張財務表筆數不變。
- MCP 與網站分析對帳用 0.5% 數值容差（即時報價會跳動，偶發超出時重跑）。

## 踩雷
- 全頁截圖會拍到 Recharts 動畫首格，要以實際 viewport 判斷圓餅是否正常。
- Recharts 點擊會出白色焦點框，已在 `globals.css` 移除；圓餅 hover 用 activeShape 外推，半徑 53%／90% 預留空間。
- 「近一年」是日曆區間，不是 365 個交易日；期間邊界注意台灣跨年凌晨與閏日。

## 待辦
- [ ] 確認正式站已移除 `DEMO_PASSWORD` env 並 redeploy（2026-10 時尚未在 Vercel 操作）。
- [ ] 網站尚未接上 live Hermes（需已部署可達端點＋管理員建立的金鑰；接法見 README）。

## 已知問題／刻意不處理
- MCP 寫入沒有防重複：AI 重複呼叫會重複新增／賣出。
- lookthrough API 仍回傳 regions（UI 與 MCP 都沒用），未改 API。
- 既有：Next middleware 遷移提醒、Recharts 尺寸 warning、開發模式 HoldingList key 警告、`body { font-family: Arial }`。
- 首頁每次多一次 Supabase 讀取（為了即時反映 Demo 開關）。
