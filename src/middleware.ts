import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Forwards the request path so `src/app/admin/layout.tsx` can branch on `/admin/login`
 * without a client hook. Why: Server Components cannot read the URL directly; middleware
 * is the supported way to attach pathname for auth guards.
 */
export function middleware(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
