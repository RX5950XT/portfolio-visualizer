import { NextResponse } from 'next/server';
import { getUserRole, getVisiblePortfolioIdsForRole } from '@/lib/auth';
import { getAiConfig } from '@/lib/ai-config';
import { buildPortfolioContext, type PortfolioContext } from '@/lib/portfolio-context';

// 串流回應：強制動態、Node runtime，避免被快取/緩衝
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 將投資組合資料整理成適合 LLM 閱讀的文字
function formatContext(ctx: PortfolioContext, extra: { metrics?: unknown; lookthrough?: unknown }): string {
  const lines: string[] = [];
  lines.push('## 投資組合快照');
  lines.push(
    `總資產 NT$${ctx.totalAssetsTwd.toLocaleString()}（股票 NT$${ctx.totalValueTwd.toLocaleString()}、現金 NT$${ctx.cashTwd.toLocaleString()}）`
  );
  lines.push(
    `總成本 NT$${ctx.totalCostTwd.toLocaleString()}，未實現損益 NT$${ctx.totalGainTwd.toLocaleString()}（${ctx.totalGainPercent.toFixed(2)}%），USD/TWD 匯率 ${ctx.exchangeRate}`
  );
  lines.push('');
  lines.push('## 持股明細（依市值排序）');
  lines.push('標的 | 市場 | 股數 | 市值TWD | 佔總資產% | 報酬%');
  for (const h of ctx.holdings) {
    lines.push(
      `${h.symbol} | ${h.market} | ${h.shares} | ${h.valueTwd.toLocaleString()} | ${h.weight.toFixed(1)}% | ${
        h.gainPercent === null ? 'N/A' : h.gainPercent.toFixed(1) + '%'
      }`
    );
  }
  if (extra.metrics) {
    lines.push('');
    lines.push('## 績效指標');
    lines.push('```json');
    lines.push(JSON.stringify(extra.metrics));
    lines.push('```');
  }
  if (extra.lookthrough) {
    lines.push('');
    lines.push('## 配置透視（含 ETF 穿透的真實重倉、產業、地區）');
    lines.push('```json');
    lines.push(JSON.stringify(extra.lookthrough));
    lines.push('```');
  }
  return lines.join('\n');
}

// 將 OpenRouter 的 SSE 串流轉成純文字串流。
// 推理模型會先吐 delta.reasoning（思考）再吐 delta.content（正文）；
// 兩者都轉發——思考以 markdown 引言區塊呈現，讓使用者立刻看到 AI 在運作，再接正文報告。
function toTextStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      let buffer = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') {
              controller.close();
              return;
            }
            try {
              // 只轉發正文；推理（delta.reasoning）不送，前端以「思考中…」表示等待
              const content: string | undefined = JSON.parse(payload)?.choices?.[0]?.delta?.content;
              if (content) controller.enqueue(encoder.encode(content));
            } catch {
              // 忽略無法解析的 keep-alive 行
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// POST: 產生 AI 投資組合健診（串流）
export async function POST(request: Request) {
  const role = await getUserRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: '無權限執行此操作' }, { status: 403 });
  }

  const config = await getAiConfig();
  if (!config.apiKey || !config.model) {
    return NextResponse.json(
      { error: '請先於設定頁填入 OpenRouter API Key 與模型名稱' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const portfolioId: string | null = body?.portfolioId ?? null;

    const visibleIds = await getVisiblePortfolioIdsForRole(role);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const ctx = await buildPortfolioContext(portfolioId, visibleIds);
    if (ctx.holdings.length === 0) {
      return NextResponse.json({ error: '此投資組合尚無持股可分析' }, { status: 400 });
    }

    const userContent = formatContext(ctx, {
      metrics: body?.metrics,
      lookthrough: body?.lookthrough,
    });

    // 連線/首個 header 最多等 60 秒，避免無限轉圈；拿到 header 後清掉計時器讓串流自由進行
    const controller = new AbortController();
    const headerTimer = setTimeout(() => controller.abort(), 60000);
    let upstream: Response;
    try {
      upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        cache: 'no-store', // 必要：避免 Next 對串流回應做快取/緩衝而卡住 header
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.7,
          // 不設 max_tokens：交由模型輸出完整內容，避免報告被長度截斷
          stream: true,
          messages: [
            { role: 'system', content: config.systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(headerTimer);
      console.error('OpenRouter 連線逾時/失敗:', e);
      return NextResponse.json(
        { error: 'AI 服務連線逾時，請稍後再試或更換較快的模型' },
        { status: 504 }
      );
    }
    clearTimeout(headerTimer);

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '');
      console.error('OpenRouter 錯誤:', upstream.status, errText.slice(0, 500));
      return NextResponse.json(
        { error: `AI 服務回應錯誤（${upstream.status}），請檢查 API Key 與模型名稱` },
        { status: 502 }
      );
    }

    return new Response(toTextStream(upstream.body), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('AI 健診失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
