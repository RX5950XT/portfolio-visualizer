# 任務：MCP 狀態確認、README 用法、配套 skill、提交（2026-10-16）

- [x] MCP 全面驗證：25 單元測試、權限 31 項、4 組合對帳、分析工具與網站逐欄一致
- [x] README 重寫 MCP 段落（建立金鑰、各用戶端接法、工具參數、單位、權限）；修正舊結構說明
- [x] 新增 `skills/portfolio-mcp/SKILL.md`（quick_validate 通過）
- [x] .gitignore 改排除所有層級 node_modules（tools workspace 的巢狀依賴）；機密掃描僅 README 佔位字
- [x] 修正 dashboard `refreshData` 缺 `loadRealizedPnl` 依賴

## Review

- lint 0 error（4 既有 warning）、build 通過；UI 回歸（已實現、摘要、分頁、頁首）通過。分析對帳首次執行一次因即時報價跳動超出 0.5% 容差失敗，重跑通過。

---

# 任務：圖表焦點框、圓餅浮起、反白顏色（2026-10-16）

- [x] 移除 Recharts 點擊後的白色焦點框（globals.css）
- [x] 圓餅 hover：該扇形外推 7px＋陰影（activeShape）；半徑改 53%／90% 預留空間
- [x] `::selection` 改白色 28% 半透明

## Review

- `verify-chart-focus`、`verify-pie-hover`（Edge）：點擊後無外框；hover 扇形 79×66 → 86×73 並有 drop-shadow；反白為 rgba(255,255,255,0.28)。build 通過。未 commit。

---

# 任務：頁首按鈕重排（2026-10-16）

- [x] 組合清單移到「新增持股」右側；兩者同為 40px 高、text-sm；手機「新增」、sm 以上「新增持股」
- [x] 整排靠右，320px 以下才換行；清單下拉手機固定左右 16px、桌面靠按鈕右緣

## Review

- `output/verify-header.mjs`（1440／768／375／320）：同高同列、清單在新增右側、靠右、無溢出、下拉不超出螢幕、console error 0；摘要回歸通過。build 通過。未 commit。

---

# 任務：MCP 編輯持股與設定現金、手機頁首靠右（2026-10-16）

- [x] 網站 PUT /api/holdings/[id]、PUT /api/cash 邏輯原文抽到 `lib/trades.ts`（updateHolding、setCash），route 改薄包裝
- [x] MCP 新增 `holding_update`（部分欄位，其餘沿用原值；僅限有剩餘股數批次）與 `cash_set`（覆寫，回傳前後值）
- [x] 手機頁首按鈕列換行時靠右（ml-auto）

## Review

- `npm test` 25/25；tsc、build 通過；lint 0 error。
- `output/verify-mcp-edit.mjs` 13 項通過：MCP 部分欄位編輯、拒絕不存在批次／組合、現金新建與覆寫、網站兩支 PUT 回應與錯誤碼不變、未登入 401；清理後筆數不變、MCP 設定還原。UI 回歸通過；375px 頁首按鈕靠右。未 commit。

---

# 任務：MCP 補齊網站分析資料、修正已實現總額（2026-10-16）

- [x] 五支分析 API 計算原文搬到 `lib/analytics/`（只改簽名與 session 取得），route 改薄包裝；ETF 費用率同樣搬移
- [x] MCP 新增 performance／asset_trend／daily_pnl／dividends／lookthrough；snapshot 加各檔與加權費用率
- [x] `portfolio_trades.totalRealizedPnlTwd` 改為先加總再四捨五入（原本多 2 元）

## Review

- 搬移後與 HEAD 逐檔 diff：僅函式名稱、Session 參數、移除 getSession 段落。
- `npm test` 24/24；tsc、build 通過；lint 0 error。
- `output/verify-mcp-analytics.mjs`：網站分析 API 未登入仍 401；MCP 各分析工具與網站 API 同參數輸出逐欄相同（數值容差 0.5% 應付報價跳動）；費用率與網站一致。`verify-mcp-parity` 4 組合已實現／現金／持股一致。暫時金鑰已還原。UI 回歸（分頁、摘要、面板、已實現）通過。未 commit。

---

# 任務：現金步進鈕、總已實現損益（2026-10-16）

- [x] 現金輸入隱藏原生上下箭頭（`.no-spinner`），改為專案樣式步進鈕（每次 ±1,000，不低於 0）
- [x] 損益卡改左右兩欄：總未實現｜總已實現（`/api/transactions` 賣出 realized_pnl_twd 加總，讀取失敗顯示 —）

## Review

- `output/verify-realized.mjs`（Edge 1440／375）：顯示值與資料庫加總一致（44,247）、步進鈕增減正確、Esc 取消未寫入、無溢出、console error 0。tsc、build 通過。未 commit。

---

# 任務：S&P 對照開關移位、回撤加 S&P、每日損益併入分頁（2026-10-16）

- [x] 共用 `BenchmarkToggle`；走勢圖開關移到標題右側（狀態提升到 dashboard）
- [x] metrics API `underwater` 加 `benchmark`（S&P 500 TWD 同期回撤）；回撤圖加白線、開關、S&P 谷底與 tooltip
- [x] 每日損益改為分析列第 5 個分頁，移除獨立卡片

## Review

- `npm test` 23/23、tsc、build 通過；lint 0 error。Edge：分頁 19 項、摘要、面板檢查通過；375px 稽核 6 個分頁＋設定無溢出、console error 0。未 commit。

---

# 任務：首頁上排三欄、圓餅縮窄、灰字再調亮（2026-10-16）

- [x] xl 以上：摘要卡｜資產配置｜股票總值走勢 三欄；md 前兩者並排、走勢跨欄；每日損益改為分析列下方整列
- [x] 圓餅改固定尺寸（手機 140、桌面 170px），與圖例上緣對齊並排
- [x] `--muted` → #c8c8c8，圖表軸／成本線 → #bdbdbd

## Review

- tsc、build 通過；lint 0 error。Edge 1440／375 檢查與 375px 稽核皆無溢出、console error 0。未 commit。

---

# 任務：首頁摘要卡重整（2026-10-16）

- [x] 移除持股分佈；總損益改名「總未實現損益」並註明不含已賣出損益
- [x] 總資產：比例條＋股票／現金兩列；現金改為虛線框按鈕（44px），點擊出現 44px 輸入框、自動全選、Enter 存／Esc 取消
- [x] 新增持股按鈕移到頁首；ETF 加權費用率移到持股清單「費用率」欄標題上方（手機為清單頂端一列）

## Review

- `output/verify-summary.mjs`（Edge 1440／375）通過：移除項目、頁首按鈕、費用率位置、現金按鈕高度、編輯開啟／自動焦點／Esc 取消、無溢出、console error 0；未按儲存，未寫入現金。
- 375px 稽核無溢出；tsc、build 通過；lint 0 error；detector `[]`。未 commit。

---

# 任務：小字易讀、手機版適配、產業欄變窄（2026-10-16）

- [x] `--muted` #737373 → #9a9a9a（對 #0a0a0a 約 4.2:1 → 6.9:1）；`text-xs` 12px → 13px；圖表軸 #666 → #8a8a8a
- [x] 手機持股卡：標籤可換行、右側損益不被裁切；總資產「股票」不再斷行
- [x] 手機點擊目標：持股／批次／交易操作 40–44px、新增持股 44px、S&P 開關 36px、Demo 勾選整行 44px
- [x] 配置透視：產業 1/3、真實重倉 2/3（lg 以上）

## Review

- 375px 稽核（`output/audit-mobile.mjs`）：dashboard 四分頁、設定、登入頁皆無橫向溢出、console error 0；小於 36px 的點擊目標只剩勾選框本體（整行 label 可點）。分頁 19 項、面板檢查均通過。
- tsc、build 通過；lint 0 error（4 既有 warning）。Impeccable detector 只回報既有 `body { font-family: Arial }`，未在本次範圍內更動。未 commit。

---

# 任務：報酬卡片合併、配置透視重排（2026-10-16）

- [x] 累積／YTD／TWR 年化／XIRR 年化合成一排四張（手機 2×2），移除獨立「年化報酬率」區塊
- [x] 配置透視移除地區分佈，產業分佈與真實重倉 Top 10 在 lg 以上並排

## Review

- tsc、build 通過；Edge 1440px／375px 實測（`output/verify-panels.mjs`）文字存在／移除正確、無橫向溢出、console error 0；Impeccable detector `[]`。
- lookthrough API 仍回傳 regions（MCP 與 UI 都未使用），未改 API。未 commit。

---

# 任務：分析列改為分頁籤（2026-10-16）

- [x] 四個分析按鈕改為分頁籤：一次一個、再點收起、方向鍵切換、記住上次分頁（儲存被封鎖時退回記憶體）

## Review

- Edge 實測 1440px／375px 共 19 項通過（`output/verify-tabs.mjs`）：預設收起、切換取代內容、重新整理記住、方向鍵、再點收起、無橫向溢出、console error 0。截圖 `output/tabs-*.png`。
- `tsc` 通過、`npm run build` 通過、lint 0 error（4 既有 warning）、Impeccable detector `[]`。手機隱藏圖示讓四個分頁排成一列。未 commit。

---

# 任務：MCP 加入買賣紀錄讀取與新增／賣出（2026-10-16）

- [x] 將網站新增持股與賣出流程抽到 `lib/trades.ts`，網站 API 與 MCP 共用
- [x] 新增 `portfolio_trades`、`holding_add`、`holding_sell`，更新設定頁、README、AGENTS 文字
- [x] 驗證 test / tsc / lint / build 與真實資料庫端到端寫入

## Review

- `npm test` 23/23；`tsc --noEmit` 通過；`npm run lint` 0 error、4 既有 warning；`npm run build` 通過；`git diff --check` 通過。
- `next start` + `output/verify-mcp-write.mjs` 18 項通過：以暫時組合實測 MCP 新增美股／台股、超賣與不存在組合／標的的錯誤訊息、依比例扣減、現金加回、買入股數＝剩餘＋已賣、已出清標的與已實現損益；網站新增／賣出 API 回應與狀態碼不變。結束後刪除測試資料、還原 MCP 金鑰設定，4 張表筆數與測試前相同。
- 同一把金鑰現在可寫入；寫入沒有防重複，AI 重複呼叫會重複新增／賣出。新增持股與網站一致不扣現金。
- 未 commit、push 或部署。

---

# 任務：首頁分析面板與圖表密度（2026-10-16）

- [x] 將績效、賣出、配息、配置透視統一成原頁展開／收起，沿用既有資料與角色限制
- [x] 縮窄分析列與內容間距，移至兩張走勢圖上方
- [x] 更正股票總值走勢標題，損益期間加入 YTD / 近一年
- [x] 驗證期間邊界、build / lint / tests、真實資料與 375px / 桌面互動


## Review

- 四個分析按鈕皆為原頁獨立展開／收起，沒有導頁連結；內容使用 next/dynamic 延後載入。舊頁面保留共用內容包裝，沒有 iframe 或複製兩套資料流程。
- 分析列位於股票／每日損益圖上方，桌面實測約 54px 高，按鈕約 44px；手機 2×2 約 101px。配息摘要、圖表、表格縮小內距並採桌面兩欄，手機表格在自身容器內捲動。
- 股票總值走勢沿用既有不含現金的計算，只有修正標題。
- 期間測試涵蓋台灣跨年凌晨、YTD 一月一日、曆年區間、閏日；`npm test` 21/21 通過，`npm run build` 通過（27 頁），`npm run lint` 0 error、4 既有 warning。Impeccable detector 回傳 `[]`，`git diff --check` 通過。
- Edge + 真實 admin 資料：1440px / 375px 四面板皆能同時展開、逐一收起，頁面維持 `/dashboard`；兩種寬度無橫向溢出、console error 為 0。
- 實際網路請求：YTD `2026-01-01..2026-10-16`，回傳 201 筆（首日 01-02）；近一年 `2025-10-16..2026-10-16`，回傳 217 筆（持股歷史自 2025-12 起）。兩者皆成功，並非用 365 個交易日冒充近一年。
- 展開四面板後切到 `01`，四個分析與兩張走勢圖都帶該組合 UUID；已還原 `rx5950xt`，收起面板、清除測試 viewport 並保留預覽。
- 未執行新增／編輯／刪除交易來驗證寫入，以免影響真實資料；相關既有權限與確認流程沿用。未 commit、push 或部署。

---

# 任務：清除剩餘套件警示、Hermes MCP 接法與 skill 更新（2026-10-16）

- [x] 追查 8 項開發依賴警示的實際 caller、官方修補狀態與相容限制
- [x] 更新已有修補版的鎖定依賴；移除未修補的 braces / micromatch 依賴鏈
- [x] 乾淨安裝、漏洞輸入、實際 Next ESLint 規則、test / lint / build / audit 驗證
- [x] 獨立唯讀審閱，修正並複驗 rootDir 中間 `./` 路徑問題
- [x] 核對 WSL Hermes 安裝版本與 MCP CLI / 設定來源，補 README
- [x] 更新 `.agents/skills/hermes` 並同步 `.claude` 副本，兩份 skill 驗證通過

## Review

- `@humanfs/node 0.16.8`、`brace-expansion 1.1.21`、`js-yaml 4.3.2` 已鎖定；`braces 3.0.3` 官方尚無修補版，Next ESLint 目前仍使用該鏈。唯一 caller 是 `get-root-dirs.js` 的目錄 `globSync`，改由明示非上游實作的私有 workspace `tools/next-eslint-glob` 提供此有限介面；未關閉 Next 規則、未忽略 audit。
- `npm ci --ignore-scripts` 通過；`npm ls fast-glob --all` 確認 Next plugin 指向本機 workspace，`braces` / `micromatch` 已移除。
- 完整 `npm audit --json`：所有等級 0 vulnerabilities。受限子程序與 Node assert 的安全／正常 YAML 檢查 5/5 通過；巨量 brace 展開被限制，本機介面超過 1000 路徑明確拒絕。
- `npm test` 19/19 通過，包含目錄 glob、陣列 rootDir、相對／絕對路徑、中間 `./`、真實 `no-html-link-for-pages` 規則有效性，以及既有 MCP / 績效測試。
- `npm run build` 通過（TypeScript、27 頁）；`npm run lint` 0 error、5 既有 warning；`git diff --check` 通過。未更動頁面樣式，本輪未重跑 UI。既有 Next middleware 遷移提醒未處理。
- Hermes 實機：Ubuntu-24.04，CLI v0.21.6+529.g6660547；設定來自 `~/.hermes/config.yaml` 的 `mcp_servers`。接入用 HTTP Bearer、`.env` 秘密變數，`hermes mcp test portfolio` 後 `/reload-mcp`；不需 OAuth 或改模型。CLI / Gateway 版本可能不同，不自行重啟。
- skill 已依實機更新版本、硬體與模型快照，加入 `references/mcp.md`，對齊其他參考檔；兩份 6 個檔案內容相同，`quick_validate.py` 均通過。未修改 live Hermes 模型、認證或 MCP 設定。
- 未 commit、push 或部署；網站仍未接上 live Hermes，需已部署的可達端點與網站管理員建立的金鑰。本輪無新增永久金鑰。

---

# 任務：修補兩項間接套件高風險（2026-10-16）

- [x] 確認實際 caller、所有套件副本與相容範圍
- [x] 僅更新 `nanoid`／`source-map-js` 的鎖定版本
- [x] 驗證漏洞輸入、正常使用、audit、test、lint、build
- [x] 獨立唯讀審閱候選修補

## Review

- 程式變更僅 `package-lock.json`：`nanoid 3.3.16 → 3.3.20`、`source-map-js 1.2.1 → 1.2.2`；`package.json` 與其餘套件版本未變。
- 更新前：`customAlphabet`／`customRandom` 長度 0，以及 indexed source map 的 `line=1e12`，均在受限子程序重現逾時。更新後：12 項檢查通過，包含零／負長度、ESM、巨大／非整數 offset、巢狀 offset 與合法上限；原漏洞輸入已安全結束或被拒絕。
- 正常控制組：預設／自訂 nanoid、PostCSS 無檔名解析、source map 產生與讀取通過。沒有新增測試檔，使用 Node assert 及具逾時限制的子程序實測。
- `npm audit --omit=dev`：0 vulnerabilities；完整 audit 尚有 8 項既有開發工具警示（7 high、1 moderate），不在此次指定兩項修補範圍。
- `npm run build` 通過（TypeScript、27 頁）；`npm run lint` 0 error、5 既有 warning；`npm test` 16/16 通過；`git diff --check` 通過。
- 建置後 CSS 的 SHA-256 與更新前完全相同，未重跑畫面驗證。Next 內嵌 nanoid 不屬兩筆 audit 指向的根層依賴，本輪未改；已查 callers 只使用無參數 `nanoid()`，未找到觸發自訂生成器漏洞的路徑。
- 獨立唯讀審閱未發現具體繞過或回歸；補查 nanoid 各入口、無效／巢狀 offset、正常 source map roundtrip 與 PostCSS inline map 均通過。
- 未 commit、push 或部署，保留前輪 MCP／UI 修改。

---

# 任務：唯讀 MCP 與分析區重排（2026-10-16）

- [x] 盤點資料來源、權限、AI 功能與導覽 caller
- [x] 新增 Streamable HTTP MCP、專用唯讀金鑰與設定頁
- [x] 移除 AI 顧問／健診及不再使用的套件
- [x] 將賣出紀錄、配息、配置透視移至績效分析旁
- [x] 驗證 MCP 權限、資料、build、lint 與桌面／375px 畫面

## Review

- `npm run build`：Next.js 16.4.2、TypeScript 與 27 頁產生通過；舊 AI API 已不在路由清單。
- `npm run lint`：0 error、5 既有 warning；`npm test`：16/16 通過。
- 正式模式 `next start` + `output/verify-mcp.mjs`：31 項通過，含 admin/guest/demo 權限、Bearer 不能授權其他 API、跨站來源、UUID、413 大小上限、真實組合與現金對帳、重設及撤銷立即生效。測試設定已還原、4 張財務表筆數不變。
- Playwright（Edge）：1440px／375px、無頁面橫向溢出；分析入口 375px 為 2×2、各 143×48px，績效可展開；三個連結實際點擊均保留 portfolio_id。MCP 設定頁無舊 AI 功能，截圖存 `output/`。
- 補充：全頁截圖會在 Recharts 重新量測時拍到動畫首格，實際 viewport 已確認圓餅圖正常；正式模式無 console error，仍有既有 Recharts 尺寸 warning。開發模式另有既有 HoldingList key 警告。
- 安全修補：Next.js 既有 CRITICAL 已消除；後續 `nanoid`／`source-map-js` 已修補，正式相依 audit 為 0，詳見上方紀錄。
- 未 commit、push、部署；未連接外部 AI 用戶端，僅實測 MCP 協定與網站端點。舊 ai_config 儲存值未刪除。

---

# 任務：密碼改存 DB + 首頁 Demo 提示 + 文件補齊

計畫：`~/.claude/plans/context-md-demo-inherited-sutton.md`

## 實作清單
- [x] `lib/auth-config.ts`：scrypt、get/save、DEMO_PASSWORD 常數
- [x] `lib/auth.ts`：`verifyPassword` async、DB 優先 env 回退
- [x] `app/api/auth/route.ts`：await verifyPassword
- [x] `app/api/settings/auth/route.ts`：GET/PUT（admin only，不外洩雜湊）
- [x] `app/page.tsx` Server + `components/LoginForm.tsx` Demo 提示
- [x] `app/settings/page.tsx`：登入密碼卡片
- [x] 文件：lessons / CONTEXT / CLAUDE / AGENTS / README / .env.example
- [x] `npm run build` + `npm run lint`
- [x] 本機 curl 端對端驗證

## Review

### 實作結果
登入密碼搬到 `app_settings.auth_config`（scrypt salt+hash）；env 僅首次引導。
Demo 固定 `demo` + 開關；首頁依開關顯示提示。`app/page.tsx` 加 `force-dynamic` 避免 bake。

### 驗證
- `npm run build` 0 error（`/` 與 `/api/settings/auth` 皆 ƒ dynamic）
- `npm run lint` 0 error（5 既有 warning）
- 本機 e2e：env 登入 → 改密後 env 失效 → 新密登入 → 還原；demo 開關 on/off；
  guest 打 settings/auth → 403；GET 無 salt/hash；首頁 `demoEnabled:true` + 提示；
  測完清 demo 列，真實資料 4 組合 / 33 持股 / 22 交易完好。

### 已知限制
- 改密碼不廢止既有 cookie
- 訪客無法只靠 DB 關閉（env 回退）
- 首頁多一次 Supabase 讀
- 正式站仍須移除 `DEMO_PASSWORD` env 並 redeploy（未在本輪操作 Vercel）
