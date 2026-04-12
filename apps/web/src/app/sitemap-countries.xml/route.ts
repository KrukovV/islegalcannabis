import { buildCountrySitemapEntries, renderUrlSetXml } from "@/lib/seo/sitemaps";

export function GET() {
  return new Response(renderUrlSetXml(buildCountrySitemapEntries()), {
    headers: {
      "content-type": "application/xml; charset=utf-8"
    }
  });
}
