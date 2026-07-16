import { NextResponse } from 'next/server';
import { getUserRole, verifyPassword } from '@/lib/auth';
import {
  getAuthConfig,
  saveAuthConfig,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  type AuthConfig,
} from '@/lib/auth-config';

async function requireAdmin(): Promise<NextResponse | null> {
  const role = await getUserRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: '無權限執行此操作' }, { status: 403 });
  }
  return null;
}

// GET: 來源狀態與 demo 開關；雜湊/salt 永不出網
export async function GET(): Promise<NextResponse> {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const config = await getAuthConfig();
    return NextResponse.json({
      data: {
        adminSource: config.admin ? 'db' : 'env',
        guestSource: config.guest
          ? 'db'
          : process.env.GUEST_PASSWORD
            ? 'env'
            : 'none',
        demoEnabled: config.demoEnabled,
      },
    });
  } catch {
    return NextResponse.json({ error: '讀取認證設定失敗' }, { status: 500 });
  }
}

// PUT: 改密碼／開關；整包存檔必須先通過目前管理員密碼
export async function PUT(request: Request): Promise<NextResponse> {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const body = await request.json().catch(() => null);
    const currentPassword =
      body && typeof body.currentPassword === 'string'
        ? body.currentPassword
        : '';

    if (!currentPassword) {
      return NextResponse.json(
        { error: '請輸入目前管理員密碼' },
        { status: 400 }
      );
    }

    const role = await verifyPassword(currentPassword);
    if (role !== 'admin') {
      return NextResponse.json({ error: '目前密碼不正確' }, { status: 403 });
    }

    const current = await getAuthConfig();
    const next: AuthConfig = {
      admin: current.admin,
      guest: current.guest,
      demoEnabled: current.demoEnabled,
    };

    if (body && typeof body.demoEnabled === 'boolean') {
      next.demoEnabled = body.demoEnabled;
    }

    const adminPw =
      body && typeof body.newAdminPassword === 'string'
        ? body.newAdminPassword.trim()
        : '';
    if (adminPw) {
      if (adminPw.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json(
          { error: `管理員密碼至少 ${MIN_PASSWORD_LENGTH} 字元` },
          { status: 400 }
        );
      }
      next.admin = hashPassword(adminPw);
    }

    const guestPw =
      body && typeof body.newGuestPassword === 'string'
        ? body.newGuestPassword.trim()
        : '';
    if (guestPw) {
      if (guestPw.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json(
          { error: `訪客密碼至少 ${MIN_PASSWORD_LENGTH} 字元` },
          { status: 400 }
        );
      }
      next.guest = hashPassword(guestPw);
    }

    await saveAuthConfig(next);
    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error('儲存認證設定失敗:', err);
    return NextResponse.json({ error: '儲存認證設定失敗' }, { status: 500 });
  }
}
