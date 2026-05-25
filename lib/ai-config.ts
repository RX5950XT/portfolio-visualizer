import { createServerClient } from '@/lib/supabase';

// OpenRouter AI 顧問設定；apiKey 為敏感資料，只在伺服器端使用，永不回傳前端
export interface AiConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
}

const SETTINGS_KEY = 'ai_config';

export const DEFAULT_SYSTEM_PROMPT =
  '你是一位專業、務實的投資組合顧問。請用繁體中文（台灣用語）分析使用者提供的投資組合資料，' +
  '聚焦於：集中度風險、跨 ETF 的重複持股、費用率拖累、與整體配置的優缺點，並給出具體可執行的再平衡建議。' +
  '語氣直接、重點條列，避免空泛口號；不提供個股買賣的投資保證。';

const DEFAULTS: Omit<AiConfig, 'apiKey'> = {
  model: '',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

// 讀取完整設定（含明文 apiKey）；僅供伺服器端 API 使用
export async function getAiConfig(): Promise<AiConfig> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    console.error('讀取 AI 設定失敗:', error);
  }

  const stored = (data?.value ?? {}) as Partial<AiConfig>;
  return {
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : '',
    model: typeof stored.model === 'string' ? stored.model : DEFAULTS.model,
    systemPrompt:
      typeof stored.systemPrompt === 'string' && stored.systemPrompt.trim()
        ? stored.systemPrompt
        : DEFAULTS.systemPrompt,
  };
}

// upsert 設定
export async function saveAiConfig(config: AiConfig): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: config, updated_at: new Date().toISOString() });

  if (error) {
    throw new Error(`儲存 AI 設定失敗: ${error.message}`);
  }
}

// 遮罩金鑰供前端顯示，永不洩漏完整值
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 10) return '••••';
  return `${key.slice(0, 6)}••••${key.slice(-4)}`;
}
