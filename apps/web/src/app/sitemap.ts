import type { MetadataRoute } from "next";
import { buildMainSitemapEntries } from "@/lib/seo/sitemaps";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildMainSitemapEntries().map((entry) => ({
    url: entry.url,
    lastModified: new Date(entry.lastModified)
  }));
}
