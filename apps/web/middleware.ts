import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function middleware(req: NextRequest) {
  const { pathname, hostname } = req.nextUrl;

  if (pathname.startsWith("/wiki-truth")) {
    const allow =
      process.env.ALLOW_WIKI_TRUTH === "1" || isLocalHost(hostname);

    if (!allow) {
      return new NextResponse(null, { status: 404 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/wiki-truth/:path*"],
};
