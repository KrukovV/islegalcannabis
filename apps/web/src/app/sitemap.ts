import type { MetadataRoute } from "next";
import { buildPrimarySitemapEntries } from "@/lib/seo/sitemaps";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildPrimarySitemapEntries().map((entry) => ({
    url: entry.url,
    lastModified: new Date(entry.lastModified)
  }));
}
