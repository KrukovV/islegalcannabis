import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveBrowserLocaleRedirect, resolveSeoRouteLocale } from "@/lib/seo/wikiLocaleContent";

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function middleware(req: NextRequest) {
  const { pathname, hostname } = req.nextUrl;

  if (hostname === "islegal.info") {
    const nextUrl = req.nextUrl.clone();
    nextUrl.hostname = "www.islegal.info";
    nextUrl.protocol = "https";
    nextUrl.port = "";
    return NextResponse.redirect(nextUrl, 301);
  }

  const redirectPath = resolveBrowserLocaleRedirect(pathname, req.headers.get("accept-language"));

  if (redirectPath) {
    const nextUrl = req.nextUrl.clone();
    nextUrl.pathname = redirectPath;
    return NextResponse.redirect(nextUrl);
  }

  if (pathname.startsWith("/wiki-truth")) {
    const allow =
      process.env.ALLOW_WIKI_TRUTH === "1" || isLocalHost(hostname);

    if (!allow) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-route-locale", resolveSeoRouteLocale(pathname));

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  if (pathname.startsWith("/sitemap") || pathname === "/api/sitemap") {
    response.headers.set("cache-control", "no-store");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.[^/]+$).*)",
    "/robots.txt",
    "/sitemap.xml",
    "/sitemap-main.xml",
    "/sitemap-index.xml",
    "/sitemap-countries.xml",
    "/sitemap-states.xml",
    "/sitemap-i18n.xml",
    "/api/sitemap"
  ],
};
