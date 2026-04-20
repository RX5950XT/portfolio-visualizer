# 📈 Portfolio Visualizer（投資組合視覺化管理工具）

一個現代化、輕量級的個人投資組合管理應用程式。專為長期投資者設計，提供資產配置視覺化、即時股價追蹤與多幣別損益分析。

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
- **ETF 費用率分析**：自動抓取並計算投資組合的加權平均費用率。

### 🌍 全球市場支援
- **台美股通吃**：美股（VOO、NVDA、AAPL 等）、台股上市（`2330.TW`）、台股上櫃（`6547.TWO`）。
- **統一貨幣**：美股資產透過即時匯率換算為新台幣（TWD）顯示。

### 🛡️ 安全與權限（RBAC）
- **Admin（管理員）**：完整讀寫權限，可執行所有操作。
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

### 4. 初始化資料庫
前往 Supabase SQL Editor，依序執行 `migrations/` 下的 SQL：

```
1. create_portfolios.sql      # 投資組合表
2. create_transactions.sql    # 交易紀錄表
3. add_guest_visibility.sql   # 訪客可見性欄位
```

### 5. 啟動開發伺服器
```bash
npm run dev
```
打開瀏覽器造訪 [http://localhost:3000](http://localhost:3000)。

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
│   │   ├── charts/         # 圖表資料計算
│   │   ├── etf/            # ETF 費用率
│   │   └── exchange/       # 匯率
│   ├── dashboard/          # 主控台
│   ├── transactions/       # 賣出紀錄頁面
│   └── page.tsx            # 登入頁
├── components/
│   ├── charts/             # Recharts 圖表元件
│   ├── holdings/           # 持股列表與表單
│   ├── transactions/       # 交易列表
│   └── ui/                 # shadcn/ui 共用元件
├── lib/
│   ├── auth-token.ts       # Edge-safe HMAC token（middleware 用）
│   ├── auth.ts             # Cookie 管理 + 訪客可見性過濾
│   ├── supabase.ts         # Supabase Client 初始化
│   └── stocks.ts           # 股價 / 匯率 API 封裝
├── middleware.ts            # 全域認證守衛
├── migrations/             # 資料庫 SQL 定義
└── types/                  # TypeScript 型別定義
```

---

## 🔐 安全說明

- **Cookie 防偽造**：Cookie 值為 `<role>.<exp>.<HMAC-SHA256-sig>`，偽造需要 `AUTH_SECRET`。
- **訪客隔離**：API 層強制過濾，訪客只能讀取 `visible_to_guest = true` 的組合。
- **密碼比對**：使用定時間比對（timing-safe）避免時序攻擊。
- **失敗延遲**：登入失敗固定延遲 400ms 阻擋快速暴力破解。

---

## 🔧 常用指令

| 動作 | 指令 |
|------|------|
| 開發伺服器 | `npm run dev` |
| 生產建置 | `npm run build` |
| 本地預覽生產版 | `npm run start` |
| Lint 檢查 | `npm run lint` |
| 部署至 Vercel | `vercel --prod` |
