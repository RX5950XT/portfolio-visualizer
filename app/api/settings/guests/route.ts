import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/auth';
import {
  getAuthConfig,
  saveAuthConfig,
  hashPassword,
  isUsernameTaken,
  isValidUsername,
  normalizeUsername,
  resolvePortfolioIds,
} from '@/lib/auth-config';

// POST: 新增訪客帳號 { username, password, portfolioIds }
export async function POST(request: Request): Promise<NextResponse> {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const body = await request.json().catch(() => null);
    const username = normalizeUsername(body?.username);
    const password = typeof body?.password === 'string' ? body.password.trim() : '';

    if (!isValidUsername(username)) {
      return NextResponse.json(
        { error: '帳號限 3–32 字元的英數字、點、底線或連字號' },
        { status: 400 }
      );
    }
    if (!password) {
      return NextResponse.json(
        { error: '請輸入密碼' },
        { status: 400 }
      );
    }
    const portfolioIds = await resolvePortfolioIds(body?.portfolioIds ?? []);
    if (!portfolioIds) {
      return NextResponse.json({ error: '投資組合格式錯誤' }, { status: 400 });
    }

    const config = await getAuthConfig();
    if (isUsernameTaken(config, username)) {
      return NextResponse.json({ error: '此帳號已存在' }, { status: 409 });
    }

    const guest = { id: randomUUID(), username, password: hashPassword(password), portfolioIds };
    await saveAuthConfig({ ...config, guestAccounts: [...config.guestAccounts, guest] });
    return NextResponse.json({ data: { id: guest.id, username, portfolioIds } });
  } catch (err) {
    console.error('新增訪客帳號失敗:', err);
    return NextResponse.json({ error: '新增訪客帳號失敗' }, { status: 500 });
  }
}
