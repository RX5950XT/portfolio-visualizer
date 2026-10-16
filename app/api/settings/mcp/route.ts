import { NextResponse } from 'next/server';
import { getUserRole } from '@/lib/auth';
import { getMcpConfig, saveMcpConfig } from '@/lib/mcp-config';
import { createMcpToken, hashMcpToken } from '@/lib/mcp-token';

async function handleSettings(request: Request): Promise<NextResponse> {
  if (await getUserRole() !== 'admin') {
    return NextResponse.json({ error: '只有管理員可設定 MCP' }, { status: 403 });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: '不允許的來源' }, { status: 403 });
  }
  try {
    if (request.method === 'DELETE') {
      await saveMcpConfig(null);
      return NextResponse.json({ data: { enabled: false } });
    }
    if (request.method === 'POST') {
      const token = createMcpToken();
      const createdAt = new Date().toISOString();
      await saveMcpConfig({ tokenHash: hashMcpToken(token), createdAt });
      return NextResponse.json({ data: { enabled: true, createdAt, token } }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const config = await getMcpConfig();
    return NextResponse.json({ data: { enabled: !!config, createdAt: config?.createdAt ?? null } }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('MCP 設定失敗:', error);
    return NextResponse.json({ error: '無法讀取或儲存 MCP 設定，請稍後再試' }, { status: 500 });
  }
}

export { handleSettings as GET, handleSettings as POST, handleSettings as DELETE };
