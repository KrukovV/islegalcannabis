import type { MetadataRoute } from "next";
import { getBuildStamp } from "@/lib/buildStamp";
import { listCountryPageData } from "@/lib/countryPageStorage";
import { listSeoTranslationEntries, getSeoLocaleHref } from "@/lib/seo/wikiLocaleContent";

const BASE_URL = "https://islegal.info";

function toLastModified(value: string | null | undefined) {
  const fallback = new Date(getBuildStamp().buildTime);
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const entries = listCountryPageData();
  return [
    {
      url: `${BASE_URL}/`,
      lastModified: toLastModified(null)
    },
    ...entries.map((entry) => ({
      url: `${BASE_URL}/c/${entry.code}`,
      lastModified: toLastModified(entry.updated_at || null)
    })),
    ...listSeoTranslationEntries().map((entry) => ({
      url: `${BASE_URL}${getSeoLocaleHref(entry.code, entry.locale)}`,
      lastModified: toLastModified(entries.find((item) => item.code === entry.code)?.updated_at || null)
    }))
  ];
}
