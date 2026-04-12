import { buildStateSitemapEntries, renderUrlSetXml } from "@/lib/seo/sitemaps";

export function GET() {
  return new Response(renderUrlSetXml(buildStateSitemapEntries()), {
    headers: {
      "content-type": "application/xml; charset=utf-8"
    }
  });
}
