import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/lib/auth-token';

// 不需要認證的路徑
const publicPaths = ['/', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith('/api/auth')
  );

  if (isPublicPath) {
    return NextResponse.next();
  }

  // 驗證 HMAC 簽章 token（舊版純文字 cookie 會驗證失敗 → 強制重登）
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const role = await verifyAuthToken(token);

  if (!role) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 匹配所有路徑，排除靜態檔案
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
