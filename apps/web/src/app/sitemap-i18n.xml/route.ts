import { buildI18nSitemapEntries, renderUrlSetXml } from "@/lib/seo/sitemaps";

export function GET() {
  return new Response(renderUrlSetXml(buildI18nSitemapEntries()), {
    headers: {
      "content-type": "application/xml; charset=utf-8"
    }
  });
}
