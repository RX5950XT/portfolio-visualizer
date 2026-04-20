# CLAUDE.md — Portfolio Visualizer 開發指南

一律使用繁體中文（臺灣用語）回答，技術術語可保留英文原文。

---

## 專案概覽

| 項目 | 內容 |
|------|------|
| **名稱** | Portfolio Visualizer（投資組合視覺化管理器） |
| **目標** | 追蹤台美股投資組合，視覺化資產配置與報酬率 |
| **技術** | Next.js 14 + TypeScript + Tailwind CSS + Supabase + Vercel |
| **用戶** | 單人使用（專案擁有者） |

### 專案文件（docs/ 僅本機，不進 git）

| 文件 | 用途 |
|------|------|
| `docs/PRD-PortfolioVisualizer-MVP.md` | 產品需求 |
| `docs/TechDesign-PortfolioVisualizer-MVP.md` | 架構與 API |
| `docs/research-PortfolioVisualizer.md` | 技術調研 |
| `docs/Project_Handover_20260208.md` | 專案交接紀錄 |

---

## AI 協作哲學

> 以 Linus Torvalds 的視角分析程式品質，確保專案從一開始就建立在堅實的技術基礎上。

### 核心原則

1. **好品味（Good Taste）**：消除邊界情況永遠優於增加條件判斷。充分相信上游數據，缺失時應在上游修正而非打補丁。
2. **不破壞用戶行為**：任何導致使用者可見行為改變的程式碼都是 bug，無論多麼「理論正確」。
3. **實用主義**：解決真實存在的問題，主動暴露問題而非掩蓋，拒絕「理論完美但實際複雜」的方案。
4. **簡潔執念**：函式必須短小精悍，只做一件事。超過 3 層縮進代表設計有問題。複雜性是萬惡之源。

### 需求確認流程

每當收到需求，按以下步驟進行：

#### 1. 理解確認
```
基於現有資訊，我理解你的需求是：[換一個說法重新講述需求]
請確認我的理解是否準確？
```

#### 2. 思考維度分析（擇要使用）

**資料結構分析**
- 核心資料是什麼？它們的關係如何？
- 有沒有不必要的資料複製或轉換？

**特殊情況識別**
- 找出所有 if/else 分支，哪些是真正業務邏輯？哪些是糟糕設計的補丁？

**複雜度審查**
- 這個功能的本質是什麼？（一句話說清）能否減少到一半的概念？

**破壞性分析**
- 列出所有可能受影響的現有功能，如何在不破壞任何東西的前提下改進？

**實用性驗證**
- 這個問題在生產環境真實存在嗎？解決方案的複雜度是否匹配問題嚴重性？

#### 3. 決策輸出

```
【結論（三選一）】
✅ 值得做：[原因]
❌ 不值得做：[原因]  
⚠️ 需要更多資訊：[缺少什麼]

【方案】（如果值得做）
1. 簡化資料結構
2. 消除特殊情況
3. 用最清晰的方式實現
4. 確保零破壞性

【反駁】（如果不值得做）
[預判 INTJ 可能的反駁，並提出對應論點]
```

### 程式碼審查標準

```
【品味評分】
🟢 好品味 / 🟡 湊合 / 🔴 垃圾

【致命問題】
- [直接指出最糟糕的部分]

【改進方向】
- "把這個特殊情況消除掉"
- "這 10 行可以變成 3 行"
- "資料結構錯了，應該是..."
```

---

## 程式碼規範

### TypeScript
- 使用 strict mode
- 所有函式需有明確回傳型別
- 避免 `any`，使用具體型別或泛型

### React / Next.js
- 使用 App Router（`app/` 目錄）
- 優先使用 Server Components
- Client Components 以 `'use client'` 開頭
- 元件檔名使用 PascalCase

### 樣式
- 使用 Tailwind CSS utility classes
- 純深色主題：背景 `#000` 或 `#0a0a0a`（`bg-black` / `bg-neutral-950`）
- 漲跌顏色語義化：漲 `#22c55e`（`text-green-500`）、跌 `#ef4444`（`text-red-500`）

### API Routes
- 路徑格式：`/api/[resource]/route.ts`
- 使用 Next.js Route Handlers（App Router）
- 回傳格式：`{ data: T } | { error: string }`

### 投資組合專屬規範

- **股票代號格式**：美股大寫（`AAPL`、`VOO`）、台股上市（`2330.TW`）、台股上櫃（`6547.TWO`）
- **貨幣處理**：美股以 USD 儲存，顯示時轉換為 TWD，匯率從 API 取得並快取
- **API 錯誤處理**：股價抓取失敗顯示「暫無數據」，保留重試機制

### 程式碼品質底線

- 函式 < 50 行，檔案 < 800 行
- 不超過 4 層巢狀（超過就重構）
- 禁止靜默吞掉例外，每一層都要處理錯誤
- 不可變資料優先：永遠建立新物件，不直接修改現有物件
- **禁止描述「做什麼」的廢話註釋**；只寫解釋「為什麼」的繁中註釋

---

## 實作階段

### Phase 1：基礎建設
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false
npm install @supabase/supabase-js recharts lucide-react
npx shadcn@latest init
npx shadcn@latest add button card input label dialog table
```

### Phase 2：資料庫設定
1. 登入 Supabase Dashboard，建立新專案
2. 執行 `migrations/` 下的 SQL（`create_portfolios.sql` → `create_transactions.sql` → `add_guest_visibility.sql`）
3. 設定環境變數

### Phase 3：認證機制（已完成，含安全強化）
- `/app/page.tsx`（登入頁）
- `/app/api/auth/route.ts`
- `lib/auth-token.ts`（Edge-safe HMAC token，供 middleware 使用）
- `lib/auth.ts`（Cookie 管理 + 訪客可見性過濾）
- `middleware.ts` 驗證 HMAC 簽章 token

### Phase 4：持股管理
- `/app/dashboard/page.tsx`
- 持股 CRUD API
- 持股表單與清單元件

### Phase 5：股價整合
- `/app/api/stocks/quote/route.ts`（整合 Yahoo Finance 公開 URL）
- 匯率 API

### Phase 6：視覺化
- 圓餅圖元件（各持股佔總資產比例）
- 損益折線圖
- 個股走勢圖

### Phase 7：進階功能
- ETF 費用率抓取
- 回測功能
- 與 S&P 500 比較

### Phase 8：部署
- 設定 Vercel 專案與環境變數
- 部署並測試

---

## 環境變數

```env
# .env.local

# 認證簽章金鑰（必填，至少 32 字元）
# 產生方式：openssl rand -hex 32
AUTH_SECRET=your_64_char_hex_secret

# 管理員密碼
SITE_PASSWORD=your_secure_password

# 訪客密碼（可選）
GUEST_PASSWORD=your_guest_password

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

> `AUTH_SECRET` 是 2026-04-20 安全強化後新增的必要欄位。未設定時應用程式會拒絕登入。

---

## 常用指令

```bash
# 開發
npm run dev

# 部署
vercel --prod

# 資料庫 Migration
npx supabase db push
```

---

## 每階段完成確認清單

- [ ] 無 TypeScript 編譯錯誤
- [ ] 無 ESLint 警告
- [ ] 頁面在 375px 寬度正確顯示
- [ ] API 回傳正確格式
- [ ] 深色主題一致

---

## 交付格式（實作功能時）

1. **程式碼**（完整可執行，含必要的繁中「為什麼」註釋）
2. **使用說明**（安裝、執行、預期結果——用初學者能懂的語言）
3. **除錯指南**（3 個常見錯誤及修復步驟）
4. **下一步澄清**（2-3 個簡單問題，確保需求明確）
