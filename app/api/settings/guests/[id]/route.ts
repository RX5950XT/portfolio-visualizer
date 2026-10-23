import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  getAuthConfig,
  saveAuthConfig,
  hashPassword,
  isUsernameTaken,
  isValidUsername,
  normalizeUsername,
  resolvePortfolioIds,
  type GuestAccount,
} from '@/lib/auth-config';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type GuestUpdate = { ok: true; guest: GuestAccount } | { ok: false; error: string };

// 只套用有帶的欄位：username、password（留空不改）、portfolioIds
async function applyUpdate(
  guest: GuestAccount,
  body: Record<string, unknown> | null,
  taken: (username: string) => boolean
): Promise<GuestUpdate> {
  let next = guest;

  if (body?.username !== undefined) {
    const username = normalizeUsername(body.username);
    if (!isValidUsername(username)) {
      return { ok: false, error: '帳號限 3–32 字元的英數字、點、底線或連字號' };
    }
    if (taken(username)) return { ok: false, error: '此帳號已存在' };
    next = { ...next, username };
  }

  const password = typeof body?.password === 'string' ? body.password.trim() : '';
  if (password) next = { ...next, password: hashPassword(password) };

  if (body?.portfolioIds !== undefined) {
    const portfolioIds = await resolvePortfolioIds(body.portfolioIds);
    if (!portfolioIds) return { ok: false, error: '投資組合格式錯誤' };
    next = { ...next, portfolioIds };
  }

  return { ok: true, guest: next };
}

// PUT: 修改訪客帳號
export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const config = await getAuthConfig();
    const guest = config.guestAccounts.find((g) => g.id === id);
    if (!guest) return NextResponse.json({ error: '找不到訪客帳號' }, { status: 404 });

    const result = await applyUpdate(guest, body, (u) => isUsernameTaken(config, u, id));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await saveAuthConfig({
      ...config,
      guestAccounts: config.guestAccounts.map((g) => (g.id === id ? result.guest : g)),
    });
    const { username, portfolioIds } = result.guest;
    return NextResponse.json({ data: { id, username, portfolioIds } });
  } catch (err) {
    console.error('修改訪客帳號失敗:', err);
    return NextResponse.json({ error: '修改訪客帳號失敗' }, { status: 500 });
  }
}

// DELETE: 刪除訪客帳號；該帳號的登入狀態會在下一次請求立即失效（getSession 回查）
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const { id } = await params;
    const config = await getAuthConfig();
    if (!config.guestAccounts.some((g) => g.id === id)) {
      return NextResponse.json({ error: '找不到訪客帳號' }, { status: 404 });
    }
    await saveAuthConfig({
      ...config,
      guestAccounts: config.guestAccounts.filter((g) => g.id !== id),
    });
    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error('刪除訪客帳號失敗:', err);
    return NextResponse.json({ error: '刪除訪客帳號失敗' }, { status: 500 });
  }
}
