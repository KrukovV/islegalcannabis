import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const crawlPaths = [
  "/robots.txt", "/sitemap.xml", "/sitemap-main.xml", "/sitemap-index.xml",
  "/sitemap-countries.xml", "/sitemap-states.xml", "/sitemap-i18n.xml", "/api/sitemap"
];

describe("crawl service proxy isolation", () => {
  it("does not redirect, negotiate language or overwrite endpoint headers for any crawl service", () => {
    for (const pathname of crawlPaths) {
      for (const userAgent of ["Googlebot", "Mozilla/5.0", "GSCWizard-Bot/1.0"]) {
        const response = proxy(new NextRequest(`https://www.islegal.info${pathname}?retry=1`, {
          headers: { "accept-language": "es-ES,ru;q=0.9", "user-agent": userAgent, cookie: "locale=pt" }
        }));
        expect(response.status).toBe(200);
        expect(response.headers.get("x-middleware-next")).toBe("1");
        expect(response.headers.has("location")).toBe(false);
        expect(response.headers.has("x-middleware-request-x-route-locale")).toBe(false);
        expect(response.headers.has("cache-control")).toBe(false);
      }
    }
  });

  it("retains canonical-host redirection and the exact path/query", () => {
    for (const pathname of crawlPaths) {
      const response = proxy(new NextRequest(`https://islegal.info${pathname}?retry=1`));
      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe(`https://www.islegal.info${pathname}?retry=1`);
    }
  });

  it("still supplies locale to HTML routes and keeps public audit routes private", () => {
    const html = proxy(new NextRequest("https://www.islegal.info/es/c/nld"));
    expect(html.headers.get("x-middleware-request-x-route-locale")).toBe("es");
    for (const pathname of ["/truth-map", "/wiki-truth", "/trust-view"]) {
      expect(proxy(new NextRequest(`https://www.islegal.info${pathname}`)).status).toBe(404);
    }
  });
});
