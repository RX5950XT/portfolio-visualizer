import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';

const configSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
});

export type McpConfig = z.infer<typeof configSchema>;

export async function getMcpConfig(): Promise<McpConfig | null> {
  const { data, error } = await createServerClient()
    .from('app_settings').select('value').eq('key', 'mcp_config').maybeSingle();
  if (error) throw new Error('讀取 MCP 設定失敗');
  return data ? configSchema.parse(data.value) : null;
}

export async function saveMcpConfig(config: McpConfig | null): Promise<void> {
  const table = createServerClient().from('app_settings');
  const { error } = config
    ? await table.upsert({ key: 'mcp_config', value: configSchema.parse(config), updated_at: new Date().toISOString() })
    : await table.delete().eq('key', 'mcp_config');
  if (error) throw new Error('儲存 MCP 設定失敗');
}
