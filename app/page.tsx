import LoginForm from '@/components/LoginForm';
import { getAuthConfig } from '@/lib/auth-config';

// Why: demo 開關存 DB，不可在 build 時 bake 進靜態頁
export const dynamic = 'force-dynamic';

// Server Component：讀 demo 開關後交給 client 表單
// Why: createServerClient 在 env 缺失時會 throw，不可讓登入頁 500
export default async function LoginPage() {
  let demoEnabled = false;
  try {
    const config = await getAuthConfig();
    demoEnabled = config.demoEnabled;
  } catch (err) {
    console.error('讀取 demo 開關失敗，首頁不顯示提示:', err);
  }

  return <LoginForm demoEnabled={demoEnabled} />;
}
