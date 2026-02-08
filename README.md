# Portfolio Visualizer (投資組合視覺化管理工具)

這是一個現代化的個人投資組合管理應用程式，專注於資產配置視覺化、即時股價追蹤與損益分析。

![App Screenshot](public/screenshot.png) *(建議之後補上實際截圖)*

## 🚀 主要功能

- **投資組合管理**：支援多個投資組合，可分別追蹤不同策略（如核心持股、衛星持股）。
- **即時股價更新**：整合 Yahoo Finance API，自動更新美股與台股（上市/上櫃）最新報價。
- **匯率自動轉換**：美股資產自動換算為台幣 (TWD) 顯示，方便統一管理。
- **ETF 費用率追蹤**：
  - 支援美股 (VOO, VTI, QQ, etc.) 與台股 (0050, 0056, etc.) ETF 內扣費用顯示。
  - 針對部分 API 資料缺失的 ETF (如 VEU, IJH, SoXX) 內建備用數據庫。
- **互動式圖表**：
  - **資產走勢圖**：支援時間軸縮放 (Zoom) 與平移 (Pan)，可查看特定區間的資產變化。
  - **每日損益圖**：顯示近 30 天損益變化，紅綠顏色區分漲跌。
  - **資產配置圓餅圖**：清晰展示各標的佔比。
- **角色權限控制 (RBAC)**：
  - **管理員 (Admin)**：擁有完整讀寫權限，可新增/修改/刪除交易與持股。
  - **訪客 (Guest)**：僅供瀏覽 (Read-only)，無法修改數據，適合分享給他人查看。

## 🛠️ 技術棧

- **框架**：[Next.js 14](https://nextjs.org/) (App Router)
- **語言**：[TypeScript](https://www.typescriptlang.org/)
- **樣式**：[Tailwind CSS](https://tailwindcss.com/)
- **資料庫**：[Supabase](https://supabase.com/) (PostgreSQL)
- **圖表庫**：[Recharts](https://recharts.org/)
- **部署**：[Vercel](https://vercel.com/)

---

## 📦 安裝與執行

### 1. 複製專案

```bash
git clone https://github.com/your-username/portfolio-visualizer.git
cd portfolio-visualizer
```

### 2. 安裝依賴

```bash
npm install
```

### 3. 設定環境變數

在專案根目錄建立 `.env.local` 檔案，並填入以下內容：

```env
# Supabase 設定 (從 Supabase Dashboard 取得)
NEXT_PUBLIC_SUPABASE_URL=你的_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=你的_SUPABASE_SERVICE_ROLE_KEY

# 權限管理密碼 (請設定強密碼)
SITE_PASSWORD=設定管理員密碼
GUEST_PASSWORD=設定訪客密碼
```

### 4. 啟動開發伺服器

```bash
npm run dev
```

開啟瀏覽器前往 [http://localhost:3000](http://localhost:3000) 即可看到應用程式。

---

## 🚀 部署 (Deploy)

本專案最適合部署於 **Vercel**。

1. 將程式碼推送到 GitHub。
2. 在 Vercel Dashboard 新增專案並連結 GitHub Repo。
3. 在 Vercel 的 **Settings > Environment Variables** 中設定上述提到的所有環境變數。
4. 點擊 **Deploy**。

---

## 📂 專案結構

```
portfolio-app/
├── app/                 # Next.js App Router 頁面與 API
│   ├── api/             # 後端 API路由 (Auth, Holdings, Stocks...)
│   ├── dashboard/       # 儀表板頁面
│   └── page.tsx         # 登入頁面
├── components/          # React 元件
│   ├── charts/          # 圖表元件 (AssetTrend, DailyPnL...)
│   └── dashboard/       # 儀表板相關元件 (AssetList, PortfolioSummary...)
├── lib/                 # 工具函式庫 (Auth, Supabase, Yahoo Finance)
└── public/              # 靜態檔案
```

## 📝 授權

MIT License
