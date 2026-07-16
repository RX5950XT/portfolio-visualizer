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
