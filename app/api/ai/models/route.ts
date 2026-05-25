import { NextResponse } from 'next/server';
import { getUserRole } from '@/lib/auth';

interface OpenRouterModel {
  id: string;
  name: string;
  pricing?: { prompt?: string; completion?: string };
}

// GET: 代理 OpenRouter 公開模型清單，供設定頁下拉「建議」（模型最終值以使用者手動輸入為準）
export async function GET() {
  const role = await getUserRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: '無權限執行此操作' }, { status: 403 });
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'User-Agent': 'portfolio-app' },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json({ data: [] });
    }

    const json = await res.json();
    const models: OpenRouterModel[] = Array.isArray(json?.data)
      ? json.data.map((m: OpenRouterModel) => ({
          id: m.id,
          name: m.name,
          pricing: m.pricing,
        }))
      : [];

    return NextResponse.json({ data: models });
  } catch {
    // 取不到清單不致命，前端仍可手動輸入模型 id
    return NextResponse.json({ data: [] });
  }
}
