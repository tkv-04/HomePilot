// src/middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AUTH_FLAG_COOKIE_NAME = 'homepilot_auth_flag'; // New flag cookie

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticatedByFlag = !!request.cookies.get(AUTH_FLAG_COOKIE_NAME)?.value;

  // If trying to access login page while authenticated flag is set, redirect to dashboard
  if (pathname === '/login' && isAuthenticatedByFlag) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If trying to access a protected app route (e.g., /dashboard/*, /manage-devices, /settings) 
  // and not authenticated flag is set, redirect to login
  const protectedPaths = ['/dashboard', '/manage-devices', '/settings'];
  if (protectedPaths.some(p => pathname.startsWith(p)) && !isAuthenticatedByFlag) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // Handle the root path ("/")
  // If authenticated flag is set, redirect to dashboard. Otherwise, redirect to login.
  if (pathname === '/') {
    if (isAuthenticatedByFlag) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Allow other paths to proceed
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
