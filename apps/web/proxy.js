import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/session.js';

// UI convenience only: pages without a valid session go to /login. It checks the JWT, not
// the Users table; API routes do the full check (requireUser) themselves.
export async function proxy(request) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const url = new URL('/login', request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Skips /api, Next internals, /login and anything that looks like a file (has a dot).
  matcher: ['/((?!api(?:/|$)|_next/|login(?:/|$)|.*\\..*).*)'],
};
