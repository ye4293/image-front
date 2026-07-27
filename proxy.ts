import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { TOKEN_COOKIE } from "@/lib/cookie-name";

export function proxy(req: NextRequest) {
  if (!req.cookies.has(TOKEN_COOKIE)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/generate/:path*"],
};
