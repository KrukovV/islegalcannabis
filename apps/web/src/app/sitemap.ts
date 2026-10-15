import type { MetadataRoute } from "next";
import { buildPrimarySitemapEntries } from "@/lib/seo/sitemaps";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildPrimarySitemapEntries().map((entry) => ({
    url: entry.url,
    ...(entry.lastModified ? { lastModified: new Date(entry.lastModified) } : {}),
    ...(entry.priority ? { priority: Number(entry.priority) } : {}),
    ...(entry.alternates?.length ? {
      alternates: {
        languages: Object.fromEntries(entry.alternates.map(({ hreflang, href }) => [hreflang, href]))
      }
    } : {})
  }));
}
