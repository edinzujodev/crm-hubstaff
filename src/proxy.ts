import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// Sends people without a session cookie to the login page. This only checks the cookie is there;
// whether it is still valid is checked on the server when a page loads (getAuth).
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Not the login page, the sign-in routes, the scheduler's sync route (it has its own secret) or static files.
  matcher: ["/((?!login|api/auth|api/sync|_next/static|_next/image|favicon.ico).*)"],
};
