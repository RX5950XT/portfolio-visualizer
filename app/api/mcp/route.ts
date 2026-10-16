import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { getMcpConfig } from '@/lib/mcp-config';
import { verifyMcpToken } from '@/lib/mcp-token';
import { createPortfolioMcpServer } from '@/lib/mcp-server';
import { portfolioReader } from '@/lib/mcp-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handleMcp(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: '不允許的來源' }, { status: 403 });
  }
  try {
    const bearer = /^Bearer (pv_[a-f0-9]{64})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
    const config = bearer ? await getMcpConfig() : null;
    if (!bearer || !config || !verifyMcpToken(bearer, config.tokenHash)) {
      return Response.json({ error: '請提供有效的 MCP 金鑰' }, {
        status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="portfolio-mcp"', 'Cache-Control': 'no-store' },
      });
    }
    if (request.method !== 'POST') {
      return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed' } }, {
        status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
      });
    }
    const server = createPortfolioMcpServer(portfolioReader);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 16_384,
    });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } finally {
      await server.close();
    }
  } catch (error) {
    console.error('MCP 請求失敗:', error);
    return Response.json({ error: 'MCP 暫時無法使用，請稍後重試' }, { status: 500 });
  }
}

export { handleMcp as POST, handleMcp as GET, handleMcp as DELETE };
