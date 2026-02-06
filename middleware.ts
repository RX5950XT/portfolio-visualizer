import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 不需要認證的路徑
const publicPaths = ['/', '/api/auth'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 檢查是否為公開路徑
  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith('/api/auth')
  );
  
  if (isPublicPath) {
    return NextResponse.next();
  }
  
  // 檢查認證 Cookie
  const authCookie = request.cookies.get('portfolio_auth');
  const isAuthenticated = authCookie?.value === 'authenticated';
  
  if (!isAuthenticated) {
    // API 請求回傳 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }
    // 頁面請求導向首頁
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
