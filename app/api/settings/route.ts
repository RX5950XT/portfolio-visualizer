import { NextResponse } from 'next/server';
import { getUserRole } from '@/lib/auth';
import { getAiConfig, saveAiConfig, maskKey } from '@/lib/ai-config';

// 權限檢查：只有管理員可讀寫設定（內含 API Key）
async function requireAdmin() {
  const role = await getUserRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: '無權限執行此操作' }, { status: 403 });
  }
  return null;
}

// GET: 取得 AI 設定（apiKey 一律遮罩，不回傳明文）
export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const config = await getAiConfig();
    return NextResponse.json({
      data: {
        hasKey: config.apiKey.length > 0,
        apiKeyMasked: maskKey(config.apiKey),
        model: config.model,
        systemPrompt: config.systemPrompt,
      },
    });
  } catch {
    return NextResponse.json({ error: '讀取設定失敗' }, { status: 500 });
  }
}

// PUT: 更新 AI 設定；apiKey 僅在提供非空字串時才覆寫（避免遮罩值蓋掉真 key）
export async function PUT(request: Request) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const body = await request.json();
    const { apiKey, model, systemPrompt } = body ?? {};

    if (typeof model !== 'string' || !model.trim()) {
      return NextResponse.json({ error: '請輸入模型名稱' }, { status: 400 });
    }

    const current = await getAiConfig();
    const nextKey =
      typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : current.apiKey;

    await saveAiConfig({
      apiKey: nextKey,
      model: model.trim(),
      systemPrompt:
        typeof systemPrompt === 'string' && systemPrompt.trim()
          ? systemPrompt
          : current.systemPrompt,
    });

    return NextResponse.json({ data: { success: true } });
  } catch {
    return NextResponse.json({ error: '儲存設定失敗' }, { status: 500 });
  }
}
