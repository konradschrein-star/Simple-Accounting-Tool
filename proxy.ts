import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

/** Optimistic gate only: real authorization happens in requireOrg() on every request. */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/signin", request.url)
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/invoices/:path*",
    "/quotes/:path*",
    "/products/:path*",
    "/clients/:path*",
    "/transactions/:path*",
    "/receipts/:path*",
    "/review/:path*",
    "/books/:path*",
    "/imports/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/console/:path*",
    "/admin/:path*",
  ],
}
