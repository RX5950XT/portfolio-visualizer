import { NextResponse } from 'next/server';
import { requireAdmin, verifyAdminPassword } from '@/lib/auth';
import {
  bootstrapAdminUsername,
  getAuthConfig,
  saveAuthConfig,
  hashPassword,
  isValidUsername,
  normalizeUsername,
} from '@/lib/auth-config';

// GET: 管理員帳號、demo 開關與訪客帳號清單；雜湊/salt 永不出網
export async function GET(): Promise<NextResponse> {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const config = await getAuthConfig();
    return NextResponse.json({
      data: {
        adminUsername: config.adminAccount?.username ?? bootstrapAdminUsername(),
        adminSource: config.adminAccount ? 'db' : 'env',
        demoEnabled: config.demoEnabled,
        guests: config.guestAccounts.map((g) => ({
          id: g.id,
          username: g.username,
          portfolioIds: g.portfolioIds,
        })),
      },
    });
  } catch {
    return NextResponse.json({ error: '讀取認證設定失敗' }, { status: 500 });
  }
}

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

// PUT: 改管理員帳號／密碼、demo 開關；必須先通過目前管理員密碼
export async function PUT(request: Request): Promise<NextResponse> {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const body = await request.json().catch(() => null);
    const currentPassword =
      typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    if (!currentPassword) return badRequest('請輸入目前管理員密碼');

    const current = await getAuthConfig();
    if (!verifyAdminPassword(currentPassword, current)) {
      return NextResponse.json({ error: '目前密碼不正確' }, { status: 403 });
    }

    const username =
      normalizeUsername(body?.newAdminUsername) ||
      current.adminAccount?.username ||
      bootstrapAdminUsername();
    if (!isValidUsername(username)) {
      return badRequest('帳號限 3–32 字元的英數字、點、底線或連字號');
    }
    if (current.guestAccounts.some((g) => g.username === username)) {
      return badRequest('此帳號已被訪客使用');
    }

    const newPassword =
      typeof body?.newAdminPassword === 'string' ? body.newAdminPassword.trim() : '';

    // env 首次引導狀態下第一次存檔，以已驗證的目前密碼建立 DB 帳號
    const password = newPassword
      ? hashPassword(newPassword)
      : (current.adminAccount?.password ?? hashPassword(currentPassword));

    await saveAuthConfig({
      ...current,
      adminAccount: { username, password },
      demoEnabled:
        typeof body?.demoEnabled === 'boolean' ? body.demoEnabled : current.demoEnabled,
    });
    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error('儲存認證設定失敗:', err);
    return NextResponse.json({ error: '儲存認證設定失敗' }, { status: 500 });
  }
}
