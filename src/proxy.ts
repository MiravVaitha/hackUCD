import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Kept in step with SESSION_COOKIE in src/lib/auth/session.ts. Not imported,
// so the proxy does not pull in database code.
const SESSION_COOKIE = "ps_session";

/**
 * Optimistic redirect only: requests to the merchant app without a session
 * cookie go to the login page. The authoritative check is requireUser(),
 * which validates the session against the database on every page and action.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = new URL("/login", request.url);
    const target = request.nextUrl.pathname + request.nextUrl.search;
    if (target !== "/app") loginUrl.searchParams.set("next", target);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};
