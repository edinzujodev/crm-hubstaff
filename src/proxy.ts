import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { needsSetup, sessionByToken } from "@/lib/session";

/**
 * Routes people to the right place before a page loads:
 * - no session cookie: the login page;
 * - signed in with Google but the authenticator code is still missing: /login/verify;
 * - two-step verification or the first-sign-in setup not done yet: /welcome.
 * This is routing only. Access itself is checked on the server (getAuth refuses a session still waiting for its code).
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL("/login", request.url));

  // Page loads only: leave API routes and server actions (POST) to their own checks.
  const path = request.nextUrl.pathname;
  if (request.method !== "GET" || path.startsWith("/api/")) return NextResponse.next();

  const row = await sessionByToken(token);
  if (!row) return NextResponse.next(); // expired or unknown: the page sends them to /login
  if (row.session.mfaPending) return NextResponse.redirect(new URL("/login/verify", request.url));
  if (needsSetup(row.user) && path !== "/welcome") return NextResponse.redirect(new URL("/welcome", request.url));
  return NextResponse.next();
}

export const config = {
  // Not the login pages, the sign-in routes, the scheduler's sync route (it has its own secret) or static files.
  matcher: ["/((?!login|api/auth|api/sync|themes|_next/static|_next/image|favicon.ico).*)"],
};
