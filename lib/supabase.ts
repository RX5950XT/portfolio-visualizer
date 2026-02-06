import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 延遲初始化客戶端，避免建置時錯誤
let supabaseInstance: SupabaseClient | null = null;

// 客戶端 Supabase 實例（用於前端）
export function getSupabase(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase 環境變數未設定');
  }
  
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
}

// 伺服器端 Supabase 實例（用於 API Routes，有更高權限）
export function createServerClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase 伺服器端環境變數未設定');
  }
  
  return createClient(supabaseUrl, serviceRoleKey);
}
