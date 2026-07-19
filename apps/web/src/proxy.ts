import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveBrowserLocaleRedirect, resolveSeoRouteLocale } from "@/lib/seo/wikiLocaleContent";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

function isPrivateTruthAuditPath(pathname: string) {
  return pathname === "/wiki-truth" ||
    pathname.startsWith("/wiki-truth/") ||
    pathname === "/trust-view" ||
    pathname.startsWith("/trust-view/");
}

export function proxy(req: NextRequest) {
  const { pathname, hostname } = req.nextUrl;

  if (isPrivateTruthAuditPath(pathname) && !isLocalAuditHost(hostname)) {
    return new NextResponse(null, { status: 404 });
  }

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
