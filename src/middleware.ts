// src/middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AUTH_COOKIE_NAME = 'homepilot_user_token'; // Placeholder, actual token management would be more robust

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Attempt to retrieve the user session indicator.
  // In a real app, this would be a secure, httpOnly cookie or a server-side session check.
  // For this mock, we'll check a cookie that LoginForm.tsx could set (though localStorage is used in AuthContext for client-side state).
  // This middleware example assumes a cookie 'auth_token' indicates a session.
  const isAuthenticated = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  const isAuthRoute = pathname === '/login' || pathname === '/signup';
  const isAppRoute = pathname.startsWith('/dashboard');

  if (isAppRoute && !isAuthenticated) {
    // Redirect to login if trying to access app routes without authentication
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && isAuthenticated) {
    // Redirect to dashboard if trying to access auth routes while authenticated
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  // Special handling for the root path
  if (pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }


  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
