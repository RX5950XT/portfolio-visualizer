import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 前端一律不直連 Supabase：不提供 anon client，資料存取全走伺服器端 service_role。
// Why: anon/authenticated 權限已在 DB 端 REVOKE，留著 anon client 只會成為繞過 API 層的回歸地雷。

// 伺服器端 Supabase 實例（用於 API Routes，有更高權限）
export function createServerClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase 伺服器端環境變數未設定');
  }
  
  return createClient(supabaseUrl, serviceRoleKey);
}
