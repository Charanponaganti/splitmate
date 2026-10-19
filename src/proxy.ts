import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic redirect only: it checks for the presence of a session cookie so
 * signed-out visitors go straight to the login page. Real authorization is
 * enforced on the server for every page, action and route handler.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/groups/:path*", "/activity/:path*", "/notifications/:path*", "/settings/:path*", "/expenses/:path*"],
};
