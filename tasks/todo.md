# portfolio-visualizer todo
最後更新：2026-11-19

## 現況（交接）
- 個人投資組合儀表板（Next.js 16 + Supabase）＋ Streamable HTTP MCP；功能、部署、MCP 用法與目錄見 `README.md`，安全與架構規範見 `AGENTS.md`。
- 網站與 MCP 共用同一份商業邏輯：交易寫入在 `lib/trades.ts`（新增、賣出、`updateHolding`、`setCash`），分析計算在 `lib/analytics/`；API route 只是薄包裝。改邏輯時兩邊一起受影響。
- 持股是「一次買入一列」（lot），前端依代號聚合顯示；賣出只在聚合層級操作。
- 登入是帳號＋密碼：`app_settings.auth_config` 存管理員（`adminAccount`）與訪客帳號（`guestAccounts[]`，各自勾選可見組合，新組合預設不開放），密碼用 scrypt；env 只用於首次引導，忘記密碼＝刪該設定列。Demo 帳密固定 `demo`，由開關控制，首頁 `force-dynamic` 才會即時反映開關。
- 安全修補（2026-11-07）已完成：登入與 Demo 次數限制（`lib/rate-limit.ts`、`auth_rate_limits`，key 為 HMAC 不留原始 IP／帳號）、改密碼用 `sessionsValidAfter` 撤銷舊憑證（由 token 到期回推簽發時間，不改 token 格式）、認證設定讀取失敗一律拋出（不退回 env、不開 Demo）、Demo 額度與輸入上限涵蓋無組合的沙盒。
- 已有安全標頭（CSP、`frame-ancestors 'none'` 等，`next.config.ts`）、資料表只給 service_role 並啟用 RLS、default privileges 讓新表天生不開放 anon。

## Demo 沙盒（動這塊前必讀）
- 每位 Demo 訪客登入時產生隨機 `demo_space` 簽進 token（4 段 `demo.<space>.<exp>.<sig>`）；`portfolios`／`holdings`／`cash_balance`／`transactions` 的 `demo_space` 真實資料為 NULL。
- 鐵則：這 4 表的每個 SELECT／UPDATE／DELETE 都要經 `scopeQuery`，每個 INSERT 都要併 `stampSpace`（`lib/auth.ts`）；多個 delete 的端點每一個都要套。漏一處就外洩或誤刪。
- `scopeQuery` 的泛型不可加約束（會觸發 TS2589）。
- Token 壽命 24h 必須與沙盒清理週期一致；清理在 Demo 登入時以 space 為單位刪 4 表（看任一列超過 24h，`cash_balance` 用 `updated_at`），不要改回靠 FK cascade。
- 種子（`lib/demo-seed.ts`）把買入日回溯一年，淨值曲線由 Yahoo 歷史價回推，不需快照；抓價失敗有固定價備援。
- 前端 `canEdit`（admin／demo）管編輯 UI，`isAdmin` 管設定；新增 UI 別混用。

## 計算口徑（關鍵決策）
- 賣出：聚合該代號所有批次，依比例扣各批次股數，每批次寫一筆 sell tx（`holding_id`＝該批次）；全部賣出改 `shares=0` 軟刪除。圖表 API 抓持股**不可加 shares>0 過濾**。
- 新增持股與網站一致**不扣現金**；賣得金額加回現金。`holding_update` 只能改仍有剩餘股數的批次。
- 同次賣出聚合依賴單一批次 insert 的 `created_at` 相同；勝率分組鍵＝`日期|標的|市場|價|created_at`（與交易頁 `groupSales` 一致），勿改用 `symbol|日期`。勝率依 `transactions.portfolio_id` 篩。
- 已實現總額先加總再四捨五入。
- 美股成本一律用買入日匯率（`fetchPurchaseFx`），未實現損益含匯差；賣出抓不到歷史匯率回 503，不用固定匯率寫入。
- `fetchHistory` 日期用交易所時區（`meta.exchangeTimezoneName`），否則 USDTWD 夏令會整串早一天；endDate 含當天。「今天」一律用台北日期。
- 每日損益：各檔收盤 forward-fill（台美休市日不同）；美股用台幣市值變化。缺報價以成本估值。
- 績效：TWR 買進算期初、賣出算期末，空手日逐日切開；波動率／Sharpe／Sortino 用 √365（日曆日曲線）；未滿一年不年化（回 null）。
- 績效含配息：除息前一天持股 × 每股配息視為當天取回現金，美股扣 30% 預扣稅；績效對照用 `^SP500TR`，資產走勢圖對照線用 `^GSPC`（市值線不含已領現金）。
- 資產走勢 S&P 對照線：復刻每筆投入的金額與時間全買 S&P，賣出時等比例縮減。
- 交易口徑：備註「對帳單回補」的 5 筆成交價已扣稅費，日後做稅費要排除。
- MCP 金鑰可讀也可寫（新增、賣出、編輯持股、設定現金）；不能刪除、不能動組合／登入／MCP 設定、不能碰 Demo 沙盒。DB 只存金鑰雜湊。
- AI 顧問／健診已移除（連同相關套件）；舊 `ai_config` 其餘欄位未刪。
- `braces` 官方無修補版：Next ESLint 唯一 caller 改由私有 workspace `tools/next-eslint-glob` 提供（超過 1000 路徑明確拒絕）；上游移除後刪掉此替代層。`npm audit` 全等級 0。
- `.gitignore` 排除所有層級 `node_modules`（tools workspace 有巢狀依賴）。
- SQL migration 有兩份：根目錄 `migrations/`（手動清單）與 `supabase/migrations/`（CLI 套用），內容冪等。

## 驗證方式
- `npm test`、`npx tsc --noEmit`、`npm run lint`（0 error，既有 4～5 個 warning）、`npm run build`。
- 安全／寫入類測試用 `supabase start` 開隔離本機庫；`NEXT_PUBLIC_*` 在 build 時寫死，連別的庫要帶環境變數重 build。
- UI／MCP 端對端腳本放 `output/verify-*.mjs`、`output/audit-mobile.mjs`（Edge，1440／375px）；寫入類測試用暫時組合，結束後刪資料並還原 MCP 金鑰設定，確認 4 張財務表筆數不變。
- MCP 與網站分析對帳用 0.5% 數值容差（即時報價會跳動，偶發超出時重跑）。

## 踩雷
- Yahoo `quoteSummary`（v10）需 crumb，在 Node／Vercel 實務上拿不到；chart（v8，含 `events=div`）正常。ETF 成分、產業、費用率因此以備援表為主（`lib/etf-holdings.ts`、`FALLBACK_EXPENSE_RATIOS`），會隨時間漂移。
- Yahoo 請求一律走 `fetchWithTimeout`，避免上游卡住無限轉圈。
- Recharts v3 自訂 `LabelList` 的幾何在 `props.viewBox`，不是頂層；負值長條 `height` 為負，定位要取 min／max。
- 全頁截圖會拍到 Recharts 動畫首格，要以實際 viewport 判斷圓餅是否正常。
- Recharts 點擊會出白色焦點框，已在 `globals.css` 移除；圓餅 hover 用 activeShape 外推，半徑 53%／90% 預留空間。
- 「近一年」是日曆區間，不是 365 個交易日；期間邊界注意台灣跨年凌晨與閏日（`lib/chart-period.ts`）。
- 近 12 月配息用年月整數推算（`setMonth` 月底會溢位）；除息持股看前一天。
- dashboard 必須自己先解析預設組合再載入資料（PortfolioSelector 在 loading 結束後才掛載，不能靠它），否則會閃一下全部組合合併的資料。
- `EditNotesDialog` 由父層條件掛載、初始備註當初始 state，勿改回 effect 同步（會觸發 lint）。
- 改 `COOKIE_MAX_AGE_SECONDS` 會讓撤銷用的簽發時間回推偏移。

## 待辦
- [ ] 確認正式站已移除 `DEMO_PASSWORD` env 並 redeploy（2026-10 時尚未在 Vercel 操作）。
- [ ] 網站尚未接上 live Hermes（需已部署可達端點＋管理員建立的金鑰；接法見 README）。
- [ ] migrations 兩份目錄的漂移整併。

## 已知問題／刻意不處理
- MCP 寫入沒有防重複：AI 重複呼叫會重複新增／賣出。
- 刪除賣出紀錄（`DELETE /api/transactions/[id]`）只刪紀錄，不回補持股與現金；`DELETE /api/holdings/[id]` 仍是硬刪且無 FK，早期硬刪造成少數孤兒賣出（績效排除、勝率仍計入）。
- 備註批次更新／刪除是前端多次請求，非單一交易；部分失敗只記錄後刷新。
- 組合全刪光時 portfolios GET 回假 `{id:'default'}`，再帶它打 API 會 UUID 錯誤（未修）。
- Demo 清理是登入時順便掃，流量大再改 cron；種子 50/50 是進場當下比例，今日會漂移（非 bug）。
- 進階指標每次展開即時重算，未接每日快照；資料多時略慢。
- 未做：交易稅費、股票分割處理、`visible_to_guest` 欄位（已不使用，留在 DB）。
- lookthrough API 仍回傳 regions（UI 與 MCP 都沒用），未改 API。
- 既有：Next middleware 遷移提醒、Recharts 尺寸 warning、開發模式 HoldingList key 警告、`body { font-family: Arial }`。
- 首頁每次多一次 Supabase 讀取（為了即時反映 Demo 開關）。
