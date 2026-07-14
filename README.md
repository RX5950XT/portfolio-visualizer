# 📈 Portfolio Visualizer（投資組合視覺化管理工具）

一個現代化、輕量級的個人投資組合管理應用程式。專為長期投資者設計，提供資產配置視覺化、即時股價追蹤、多幣別損益分析，以及 AI 投資組合健診。

---

## ✨ 核心功能

### 💼 資產管理
- **多投資組合**：建立多個投資組合，可將退休帳戶與短線帳戶分開管理。
- **現金部位追蹤**：獨立記錄現金餘額，提供更真實的總資產視圖。
- **完整 CRUD**：支援持股的新增、編輯、刪除，記錄買入日期與成本。
- **賣出紀錄**：賣出操作自動計算已實現損益（TWD）並存入交易歷史。

### 📊 視覺化分析
- **資產配置圓餅圖**：自動計算各持股佔比，按權重排序。
- **損益走勢圖**：長條圖呈現近 30 日每日盈虧變化（含 Brush 縮放）。
- **歷史資產曲線**：追蹤總資產隨時間成長（市值線 + 成本線）。
- **S&P 500 對照線**：復刻實際投入金額與時間點，模擬同期全押標普 500（^GSPC）的走勢，一鍵開關比較自身績效領先或落後大盤。
- **ETF 費用率分析**：自動抓取並計算投資組合的加權平均費用率。

### 🧠 進階洞察
- **AI 投資組合健診**（`/insights`）：串接 OpenRouter，由 LLM 分析集中度風險、ETF 重疊、費用拖累並給出可執行的再平衡建議（串流輸出、Markdown 渲染）。模型與金鑰由 `/settings` 自行設定。
- **配置透視 / 揭穿真實重倉**（`/insights`）：穿透 ETF 持股（Yahoo `topHoldings`），合併「直接持有 + 透過 ETF」算出真實重倉 Top 10，單一標的 >10% 標記 ⚠️，並呈現產業 / 地區分佈。
- **績效分析**（dashboard 摺疊區）：TWR 累積、YTD、年度與年化報酬，並列 XIRR 個人資金年化；另含 S&P 500 超額報酬、年化波動率、Sharpe、Sortino、勝率，以及回撤歷時與復原資訊。
- **配息追蹤**（`/dividends`）：近 12 月配息、預估年配息、殖利率與殖利率@成本、即將除息清單（美股經匯率換算 TWD）。

### 🌍 全球市場支援
- **台美股通吃**：美股（VOO、NVDA、AAPL 等）、台股上市（`2330.TW`）、台股上櫃（`6547.TWO`）。
- **統一貨幣**：美股資產透過即時匯率換算為新台幣（TWD）顯示。

### 🛡️ 安全與權限（RBAC）
- **Admin（管理員）**：完整讀寫權限，可執行所有操作（含 AI 健診與設定）。
- **Guest（訪客）**：唯讀模式，僅能看到管理員開放的投資組合。
- **HMAC 簽章 Cookie**：認證 token 採 HMAC-SHA256 簽章，無法手動偽造。
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
| AI | OpenRouter（OpenAI 相容 API，串流）+ react-markdown |
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

# 管理員密碼（強密碼，建議 16+ 字元）
SITE_PASSWORD=your_admin_password

# 訪客密碼（可選；不設定則不開放訪客模式）
GUEST_PASSWORD=your_guest_password

# ── Supabase ───────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> **⚠️ 重要**：`AUTH_SECRET` 未設定或長度不足 32 字元時，應用程式會在登入時直接報錯。Vercel 部署也需在 Dashboard → Settings → Environment Variables 設定相同值。
>
> OpenRouter API Key **不放環境變數**；登入後於 `/settings` 頁填入，存於資料庫（僅 service_role 可讀、永不回傳前端）。

### 4. 初始化資料庫
前往 Supabase SQL Editor，依下列順序執行（含相依關係）：

```
1. supabase/schema.sql                              # 基礎表：cash_balance / holdings / daily_snapshots / etf_expense_ratios
2. migrations/create_portfolios.sql                 # portfolios 表 + 為 holdings/cash_balance 補 portfolio_id
3. migrations/create_transactions.sql               # transactions 交易紀錄表
4. migrations/add_guest_visibility.sql              # 訪客可見性欄位
5. migrations/20260513_supabase_data_api_remediation.sql  # 啟用 RLS、補 service_role GRANT、補建缺漏表
6. migrations/20260525_app_settings.sql             # AI 顧問設定表（含 OpenRouter Key，僅 service_role）
7. migrations/20260525_revoke_anon_data_access.sql  # 安全修補：撤銷 anon/authenticated 的 Data API 權限
```

> 已連結 Supabase CLI 者可改用 `npx supabase db push`（`supabase/migrations/` 內含對應的 app_settings 與 anon 撤銷 migration）。

### 5. 啟動開發伺服器
```bash
npm run dev
```
打開瀏覽器造訪 [http://localhost:3000](http://localhost:3000)。

### 6.（選用）啟用 AI 健診
以管理員登入 → 進入 `/settings` → 填入 OpenRouter API Key 與模型 id（例如 `google/gemini-3.5-flash`、`anthropic/claude-opus-4`）→ 至 `/insights` 點「產生健診」。

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
│   │   ├── ai/             # AI 健診（advisor 串流 + models 清單）
│   │   └── settings/       # AI 設定（admin、API Key 遮罩）
│   ├── dashboard/          # 主控台（含進階績效指標摺疊區）
│   ├── transactions/       # 賣出 / 交易紀錄頁面
│   ├── dividends/          # 配息追蹤頁
│   ├── insights/           # AI 健診 + 配置透視頁
│   ├── settings/           # AI 顧問設定頁
│   ├── icon.svg            # 品牌 logo（favicon / PWA）
│   └── page.tsx            # 登入頁
├── components/
│   ├── charts/             # Recharts 圖表（含 MetricsPanel）
│   ├── holdings/           # 持股列表與表單
│   ├── transactions/       # 交易列表
│   ├── insights/           # AiAdvisorCard / 分佈長條圖 / 真實重倉表
│   ├── portfolios/         # 投資組合選擇器
│   ├── Logo.tsx            # 共用品牌標誌元件
│   └── ui/                 # shadcn/ui 共用元件
├── lib/
│   ├── auth-token.ts       # Edge-safe HMAC token（middleware 用）
│   ├── auth.ts             # Cookie 管理 + 訪客可見性過濾
│   ├── supabase.ts         # Supabase Client 初始化（anon / service_role）
│   ├── ai-config.ts        # OpenRouter 設定讀寫 + 金鑰遮罩
│   ├── stocks.ts           # 股價 / 匯率 / 配息 API 封裝
│   ├── yahoo-crumb.ts      # Yahoo quoteSummary crumb 認證
│   ├── etf-holdings.ts     # ETF 持股穿透
│   ├── metrics.ts          # TWR / XIRR / 基準超額 / 回撤 / 風險指標
│   ├── equity-curve.ts     # 每日權益曲線建構
│   ├── portfolio-context.ts# AI 健診的組合資料整理
│   └── portfolio-history.ts# 回溯持股數 / 密集匯率
├── middleware.ts           # 全域認證守衛
├── migrations/             # 資料庫 SQL 定義
├── supabase/               # Supabase CLI schema 與 migrations
└── types/                  # TypeScript 型別定義
```

---

## 🔐 安全說明

- **Cookie 防偽造**：Cookie 值為 `<role>.<exp>.<HMAC-SHA256-sig>`，偽造需要 `AUTH_SECRET`。
- **資料庫存取收斂**：所有資料表**僅** GRANT 給 `service_role`，**不開放** `anon`/`authenticated`；app 一律經伺服器端 service_role 存取。如此即使公開的 anon key 外流，未登入者打 Data API 也只會得到 `401`，無法繞過密碼直讀資料。
- **RLS 預設拒絕**：資料表啟用 RLS 但不建立寬鬆 policy（禁用 `USING(true)`）；service_role 不受 RLS 限制，app 正常運作。
- **OpenRouter Key 保護**：金鑰存於 `app_settings`（僅 service_role），僅伺服器端使用；API 回前端一律遮罩（`sk-or-…abcd`），永不回傳明文。
- **訪客隔離**：API 層強制過濾，訪客只能讀取 `visible_to_guest = true` 的組合。
- **密碼比對**：使用定時間比對（timing-safe）避免時序攻擊。
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
