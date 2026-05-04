import { buildMainSitemapEntries, renderUrlSetXml } from "@/lib/seo/sitemaps";

export function GET() {
  return new Response(renderUrlSetXml(buildMainSitemapEntries()), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
