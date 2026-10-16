# 📈 Portfolio Visualizer（投資組合視覺化管理工具）

一個輕量級的個人投資組合管理應用程式，提供資產配置、股價追蹤、多幣別損益分析，以及讓 AI 讀取全部投資數據、代為新增／賣出／編輯持股與設定現金的 MCP。

---

## ✨ 核心功能

### 💼 資產管理
- **多投資組合**：建立多個投資組合，可將退休帳戶與短線帳戶分開管理。
- **現金部位追蹤**：獨立記錄現金餘額，提供更真實的總資產視圖。
- **完整 CRUD**：支援持股的新增、編輯、刪除，記錄買入日期與成本。
- **賣出紀錄**：賣出操作自動計算已實現損益（TWD）並存入交易歷史。

### 📊 視覺化分析
- **資產配置圓餅圖**：自動計算各持股佔比，按權重排序。
- **損益走勢圖**：每日盈虧可選 30／60／90／180 日、YTD、近一年與自訂日期。YTD 從台灣日期的當年 1 月 1 日起算；近一年為曆年區間。
- **股票總值走勢**：追蹤持股市值與成本，不含現金；可開關 S&P 500 對照。
- **S&P 500 對照線**：復刻實際投入金額與時間點，模擬同期全押標普 500（^GSPC）的走勢，一鍵開關比較自身績效領先或落後大盤。
- **ETF 費用率分析**：自動抓取並計算投資組合的加權平均費用率。

### 🧠 進階洞察
- **MCP**（`/api/mcp`）：讓支援 Streamable HTTP 與自訂 Authorization header 的 AI 讀取投資組合清單、持股、現金、成本、未實現損益、配置比例、買賣紀錄與已實現損益，以及績效、走勢、每日損益、配息、配置透視、ETF 費用率，並可新增、賣出、編輯持股與設定現金。於 `/settings` 建立或撤銷專用金鑰；用法見「連接 AI 的 MCP」。
- **配置透視 / 揭穿真實重倉**（首頁可展開）：穿透 ETF 持股（Yahoo `topHoldings`），合併「直接持有 + 透過 ETF」算出真實重倉 Top 10，單一標的 >10% 標記 ⚠️，並呈現產業 / 地區分佈。
- **績效分析**（首頁可展開）：TWR 累積、YTD、年度與年化報酬，並列 XIRR 個人資金年化；另含 S&P 500 超額報酬、年化波動率、Sharpe、Sortino、勝率，以及回撤歷時與復原資訊。
- **配息追蹤**（首頁可展開）：近 12 月配息、預估年配息、殖利率與殖利率@成本、即將除息清單（美股經匯率換算 TWD）。

### 🌍 全球市場支援
- **台美股通吃**：美股（VOO、NVDA、AAPL 等）、台股上市（`2330.TW`）、台股上櫃（`6547.TWO`）。
- **統一貨幣**：美股資產透過即時匯率換算為新台幣（TWD）顯示。

### 🛡️ 安全與權限（RBAC）
- **Admin（管理員）**：完整讀寫權限，可管理登入與 MCP 連線設定。
- **Guest（訪客）**：唯讀模式，僅能看到管理員開放的投資組合。
- **Demo（試玩沙盒）**：輸入公開密碼 `demo` 進入**每人專屬的獨立沙盒**（可於 `/settings` 開關），可自由增刪改體驗，
  碰不到管理員與訪客的任何資料；預設種子為「一年前各投入 NT$50 萬買 VT 與 0050」，24 小時後自動重置。不提供設定與 MCP 金鑰管理。
- **HMAC 簽章 Cookie**：認證 token 採 HMAC-SHA256 簽章，無法手動偽造（demo 的沙盒 id 亦納入簽章）。
- **訪客可見性控制**：每個投資組合可獨立設定是否對訪客開放。

---

## 🛠️ 技術堆疊

| 分類 | 技術 |
|------|------|
| Framework | Next.js 16（App Router） |
| Database | Supabase（PostgreSQL） |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Charts | Recharts |
| Icons | Lucide React |
| AI 連線 | MCP TypeScript SDK（Streamable HTTP、專用 Bearer 金鑰） |
| Data Source | Yahoo Finance（非官方公開端點） |
| Deploy | Vercel |

---

## 🚀 快速開始

### 1. 複製專案
```bash
git clone https://github.com/your-username/portfolio-visualizer.git
cd portfolio-app
```

### 2. 安裝套件
```bash
npm install
```

### 3. 設定環境變數
在專案根目錄建立 `.env.local`：

```env
# ── 認證 ──────────────────────────────────────────────────────────
# Cookie 簽章金鑰（必填，至少 32 字元）
# 產生方式：openssl rand -hex 32
AUTH_SECRET=your_64_char_hex_secret_here

# 管理員密碼（首次引導用；於 /settings 設定後以資料庫 scrypt 雜湊為準）
SITE_PASSWORD=your_admin_password

# 訪客密碼（可選；首次引導用，之後可於 /settings 修改）
GUEST_PASSWORD=your_guest_password

# Demo 空間：公開密碼固定為 demo，啟用狀態存於資料庫（/settings 可開關）

# ── Supabase ───────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> **⚠️ 重要**：`AUTH_SECRET` 未設定或長度不足 32 字元時，應用程式會在登入時直接報錯。Vercel 部署也需在 Dashboard → Settings → Environment Variables 設定相同值。
>
> `SITE_PASSWORD` / `GUEST_PASSWORD` 僅作**首次引導**：管理員於 `/settings` 設定密碼後，以資料庫雜湊為準，env 即失效。MCP 金鑰由設定頁產生，資料庫只存 SHA-256 雜湊。
>
> **忘記密碼**：到 Supabase 刪除 `app_settings` 中 `key = 'auth_config'` 的列，即可回到 env 引導密碼登入。

### 4. 初始化資料庫
前往 Supabase SQL Editor，依下列順序執行（含相依關係）：

```
1. supabase/schema.sql                              # 基礎表：cash_balance / holdings / daily_snapshots / etf_expense_ratios
2. migrations/create_portfolios.sql                 # portfolios 表 + 為 holdings/cash_balance 補 portfolio_id
3. migrations/create_transactions.sql               # transactions 交易紀錄表
4. migrations/add_guest_visibility.sql              # 訪客可見性欄位
5. migrations/20260513_supabase_data_api_remediation.sql  # 啟用 RLS、補 service_role GRANT、補建缺漏表
6. migrations/20260525_app_settings.sql             # 設定表（登入／MCP 設定，僅 service_role）
7. migrations/20260525_revoke_anon_data_access.sql  # 安全修補：撤銷 anon/authenticated 的 Data API 權限
8. migrations/20260716_demo_space.sql               # Demo 沙盒：4 表加 demo_space 欄位 + partial index
```

> 已連結 Supabase CLI 者可改用 `npx supabase db push`（`supabase/migrations/` 內含對應的 app_settings 與 anon 撤銷 migration）。

### 5. 啟動開發伺服器
```bash
npm run dev
```
打開瀏覽器造訪 [http://localhost:3000](http://localhost:3000)。

### 6.（選用）連接 AI 的 MCP

讓支援 MCP 的 AI（Claude Code、Claude Desktop、Cursor、Hermes 等）讀取你的投資資料，並代你新增、賣出、編輯持股與設定現金。計算與寫入全部和網站共用同一份程式（`lib/analytics/`、`lib/trades.ts`），AI 拿到的數字、做出的操作和你在網站上看到的一致。

#### 第一步：建立金鑰

1. 以管理員登入，到 `/settings` 的「MCP 連線」按「建立金鑰」。
2. 複製畫面上的金鑰（`pv_` 開頭）與連線設定。**金鑰只顯示這一次**；忘記就按「重設金鑰」換新的，舊的立即失效。
3. 不再使用時按「撤銷連線」，所有 AI 立刻斷線。

#### 第二步：接上 AI 用戶端

伺服器網址為 `https://你的網站/api/mcp`，傳輸方式 Streamable HTTP，驗證方式為 HTTP header `Authorization: Bearer <金鑰>`。用戶端必須支援自訂 header（不支援 OAuth）。

**通用 JSON 設定**（Claude Desktop、Cursor 等）：

```json
{
  "mcpServers": {
    "portfolio-visualizer": {
      "url": "https://你的網站/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_MCP_TOKEN" }
    }
  }
}
```

**Claude Code**：

```bash
claude mcp add --transport http portfolio https://你的網站/api/mcp --header "Authorization: Bearer YOUR_MCP_TOKEN"
```

**Hermes Agent（WSL）**：見下方小節。

接好後，把專案的 [`skills/portfolio-mcp`](skills/portfolio-mcp/SKILL.md) 一併給 AI（複製到該用戶端的 skills 目錄），它會知道各工具的單位、操作前要先確認、怎麼回答常見問題。

#### 工具一覽

讀取（不會改資料）：

| 工具 | 用途 | 參數 |
|------|------|------|
| `portfolio_list` | 列出真實投資組合的 id、名稱、是否預設 | 無 |
| `portfolio_snapshot` | 現況：持股股數、報價、市值、成本、未實現損益、權重、現金、各檔與加權 ETF 費用率 | `portfolio_id`（可省略＝合併全部組合） |
| `portfolio_trades` | 每筆買入批次（`lotId`、日期、原幣成本價、買入／剩餘股數）、賣出紀錄、各標的與總已實現損益 | `portfolio_id`（可省略） |
| `portfolio_performance` | 績效：TWR（累積／YTD／年化／各年）、XIRR、跟大盤比（同期 S&P 500）、最大回撤（含 S&P 500 最深回撤）、波動率、Sharpe、Sortino、勝率 | `portfolio_id`（可省略） |
| `portfolio_asset_trend` | 股票總值走勢：每日市值、成本、S&P 500 對照 | `portfolio_id`（可省略） |
| `portfolio_daily_pnl` | 每日損益 | `portfolio_id`；`days`（預設 30）或 `start`＋`end`（YYYY-MM-DD，需成對、不可與 `days` 並用） |
| `portfolio_dividends` | 配息：預估年配息、本月配息、殖利率、殖利率@成本、近 12 月、即將除息 | `portfolio_id`（可省略） |
| `portfolio_lookthrough` | 配置透視：穿透 ETF 的真實重倉、產業與地區分佈 | `portfolio_id`（可省略） |

寫入（會改資料，AI 應先跟你確認）：

| 工具 | 用途 | 參數 | 重複呼叫 |
|------|------|------|------|
| `holding_add` | 新增一筆買入，同網站「新增持股」；**不扣現金** | `portfolio_id`、`symbol`、`shares`、`cost_price`、`purchase_date` | 會重複新增 |
| `holding_sell` | 賣出某檔，同網站「賣出」：各批次依比例扣、算已實現損益、賣得金額**加回現金** | `portfolio_id`、`symbol`、`shares`、`price`、`transaction_date`、`notes`（可省略） | 會重複賣出 |
| `holding_update` | 編輯一筆買入批次，同網站「編輯持股」；只傳要改的欄位。改股數不會產生賣出紀錄、不動現金 | `lot_id`（取自 `portfolio_trades`）、`symbol`／`shares`／`cost_price`／`purchase_date` 至少一項 | 結果相同 |
| `cash_set` | 把組合現金**直接設為**新金額（不是加減），同網站「修改現金」；回傳修改前後金額 | `portfolio_id`、`amount_twd` | 結果相同 |

#### 單位與注意事項

- 金額一律為新台幣（TWD）；個股 `price`、`cost_price` 為標的原幣（美股 USD、台股 TWD）。台股代號加 `.TW`／`.TWO`。
- `portfolio_snapshot` 的 `weight`、`gainPercent` 是百分點（25 = 25%）；其餘工具的報酬、殖利率、回撤、費用率是小數（0.12 = 12%）。
- 先看 `valuationComplete` 與 `warnings`：缺報價或匯率時總額不完整，不能當成實際虧損。
- 「同期」＝投組第一筆買入日（含已賣光的批次）到今天；S&P 500 以台幣計、含匯率變動。
- 未實現損益是現有持股市值減成本；已實現損益是已賣出部分的損益加總；兩者都不是 TWR。

#### 權限與安全

- 金鑰等同管理員對**真實資料**的讀寫權：能讀全部真實組合（包含對訪客隱藏的組合），能新增、賣出、編輯持股與設定現金。
- 不能：刪除持股或交易紀錄、建立／刪除組合、修改登入或 MCP 設定、讀寫 Demo 沙盒、用金鑰打網站其他 API。網站登入 cookie 也不能代替金鑰。
- 每個參數都經嚴格驗證（UUID、正數、日期格式、代號字元），不合法直接拒絕、不寫入。使用者可修正的錯誤（例如賣出超過持有量）會原文回給 AI；伺服器錯誤只回通用訊息，不洩漏細節。
- 資料庫只存金鑰的 SHA-256 雜湊；只有管理員能建立、重設、撤銷。金鑰外流時立即到 `/settings` 撤銷或重設。

技術細節：官方 MCP TypeScript SDK、無狀態 JSON 回應，依 [MCP Streamable HTTP 規格](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) 實作；GET 不維持 SSE 連線、回 405；單次請求上限 16 KB。不需要新增資料表或 migration。

#### Hermes Agent（WSL）

Hermes 使用 `~/.hermes/config.yaml` 的 `mcp_servers`，格式與上方 JSON 不同。網站部署且專用金鑰建立後，可用 CLI 新增：

```bash
hermes mcp add portfolio --url https://你的網站/api/mcp --auth header
```

CLI 會互動詢問 Bearer 金鑰，並存入 `~/.hermes/.env` 的 `MCP_PORTFOLIO_API_KEY`；不要把金鑰寫進命令列或 git。對應設定如下，須合併到既有 `mcp_servers`，保留其他連線：

```yaml
mcp_servers:
  portfolio:
    url: "https://你的網站/api/mcp"
    headers:
      Authorization: "Bearer ${MCP_PORTFOLIO_API_KEY}"
    timeout: 60
```

`hermes mcp test portfolio` 應列出上方十二個工具；既有對話使用 `/reload-mcp` 或開新對話後即可讀取投資組合。無須更換主模型、fallback，或設定 OAuth。接入方式已核對本機 Hermes v0.21.6 與[官方 MCP 文件](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md)；需網站已部署並建立金鑰後才能連線。

---

## 📂 專案結構

```
portfolio-app/
├── app/
│   ├── api/                # API Routes
│   │   ├── auth/           # 登入 / 登出 / 取得角色
│   │   ├── holdings/       # 持股 CRUD
│   │   ├── portfolios/     # 投資組合 CRUD
│   │   ├── transactions/   # 交易紀錄 CRUD
│   │   ├── stocks/         # 股價 / 歷史資料 Proxy
│   │   ├── cash/           # 現金餘額
│   │   ├── charts/         # 圖表資料計算（含 metrics 進階指標）
│   │   ├── etf/            # ETF 費用率
│   │   ├── exchange/       # 匯率
│   │   ├── dividends/      # 配息追蹤
│   │   ├── insights/       # 配置透視 / ETF 穿透
│   │   ├── mcp/            # MCP（專用 Bearer 金鑰）
│   │   └── settings/       # 登入與 MCP 金鑰設定（admin）
│   ├── dashboard/          # 主控台（摘要、資產配置、走勢；五個分析分頁）
│   ├── transactions/       # 賣出 / 交易紀錄頁面
│   ├── dividends/          # 配息追蹤頁
│   ├── insights/           # 配置透視頁
│   ├── settings/           # 登入與 MCP 設定頁
│   ├── icon.svg            # 品牌 logo（favicon / PWA）
│   └── page.tsx            # 登入頁
├── components/
│   ├── charts/             # Recharts 圖表（含 MetricsPanel）
│   ├── holdings/           # 持股列表與表單
│   ├── transactions/       # 交易列表
│   ├── insights/           # 分佈長條圖 / 真實重倉表
│   ├── AnalysisPanels.tsx  # 績效、每日損益、賣出、配息、配置透視分頁
│   ├── McpSettings.tsx     # MCP 金鑰與連線設定
│   ├── portfolios/         # 投資組合選擇器
│   ├── Logo.tsx            # 共用品牌標誌元件
│   └── ui/                 # shadcn/ui 共用元件
├── lib/
│   ├── auth-token.ts       # Edge-safe HMAC token（middleware 用）
│   ├── auth.ts             # Cookie 管理 + 訪客可見性過濾 + demo 沙盒隔離（scopeQuery / stampSpace）
│   ├── auth-config.ts      # 登入密碼 scrypt 雜湊讀寫（app_settings.auth_config）
│   ├── demo-seed.ts        # Demo 沙盒種子（VT/0050）與過期清理
│   ├── supabase.ts         # Supabase Client 初始化（anon / service_role）
│   ├── mcp-config.ts       # MCP 金鑰雜湊讀寫
│   ├── mcp-token.ts        # 隨機金鑰與定時間比對
│   ├── mcp-server.ts       # MCP 工具定義
│   ├── mcp-data.ts         # MCP 資料存取（呼叫 analytics / trades，排除 Demo）
│   ├── trades.ts           # 新增、賣出、編輯持股與設定現金（網站 API 與 MCP 共用）
│   ├── analytics/          # 績效、走勢、每日損益、配息、配置透視、ETF 費用率計算（網站 API 與 MCP 共用）
│   ├── stocks.ts           # 股價 / 匯率 / 配息 API 封裝
│   ├── yahoo-crumb.ts      # Yahoo quoteSummary crumb 認證
│   ├── etf-holdings.ts     # ETF 持股穿透
│   ├── metrics.ts          # TWR / XIRR / 基準超額 / 回撤 / 風險指標
│   ├── equity-curve.ts     # 每日權益曲線建構
│   ├── portfolio-context.ts# 投資組合快照整理
│   └── portfolio-history.ts# 回溯持股數 / 密集匯率
├── middleware.ts           # 全域認證守衛
├── migrations/             # 資料庫 SQL 定義
├── skills/portfolio-mcp/   # 給 AI 用戶端的配套 skill（MCP 用法與安全規則）
├── supabase/               # Supabase CLI schema 與 migrations
└── types/                  # TypeScript 型別定義
```

---

## 🔐 安全說明

- **Cookie 防偽造**：Cookie 值為 `<role>.<exp>.<HMAC-SHA256-sig>`（demo 為 `demo.<space>.<exp>.<sig>`），偽造需要 `AUTH_SECRET`；demo 的沙盒 id 納入簽章，無法竄改成他人沙盒。
- **資料庫存取收斂**：所有資料表**僅** GRANT 給 `service_role`，**不開放** `anon`/`authenticated`；app 一律經伺服器端 service_role 存取。如此即使公開的 anon key 外流，未登入者打 Data API 也只會得到 `401`，無法繞過密碼直讀資料。
- **RLS 預設拒絕**：資料表啟用 RLS 但不建立寬鬆 policy（禁用 `USING(true)`）；service_role 不受 RLS 限制，app 正常運作。
- **MCP 金鑰保護**：隨機 256-bit 金鑰只在建立時回傳一次，資料庫只存 SHA-256 雜湊。管理端限 admin，專用金鑰可讀真實投資資料，並透過 MCP 新增、賣出、編輯持股與設定現金；不能刪除、不能碰 Demo，也不能存取網站其他 API 或設定端點。已移除的 OpenRouter 功能不再讀取舊 `ai_config`，既有儲存值不自動刪除。
- **登入密碼雜湊**：管理員／訪客密碼以 scrypt 存 `app_settings.auth_config`（salt+hash）；env 僅首次引導。Demo 公開密碼固定 `demo`，開關存同 key。GET 永不回傳 salt/hash。
- **訪客隔離**：API 層強制過濾，訪客只能讀取 `visible_to_guest = true` 的組合。
- **Demo 沙盒隔離**：4 張資料表帶 `demo_space`（真實資料為 NULL）。所有查詢經 `scopeQuery` 統一套述詞——admin/guest 查 `demo_space IS NULL`、demo 查 `= 自己的 space`。因此 demo 就算帶著真實資料的 row id 打寫入端點，也只會匹配 0 筆而無效（安全 by construction）。
- **密碼比對**：env 明文用字串 timing-safe；DB 雜湊用 Buffer timing-safe 比對 scrypt 結果。
- **失敗延遲**：登入失敗固定延遲 400ms 阻擋快速暴力破解（正式環境建議於 Vercel 邊界再加 rate limit）。

---

## 🔧 常用指令

| 動作 | 指令 |
|------|------|
| 開發伺服器 | `npm run dev` |
| 生產建置 | `npm run build` |
| 本地預覽生產版 | `npm run start` |
| Lint 檢查 | `npm run lint` |
| 套用資料庫 migration | `npx supabase db push` |
| 部署至 Vercel | `vercel --prod` |
