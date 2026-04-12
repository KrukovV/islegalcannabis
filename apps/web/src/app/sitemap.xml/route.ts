import { buildSitemapIndexEntries, renderSitemapIndexXml } from "@/lib/seo/sitemaps";

export function GET() {
  return new Response(renderSitemapIndexXml(buildSitemapIndexEntries()), {
    headers: {
      "content-type": "application/xml; charset=utf-8"
    }
  });
}
