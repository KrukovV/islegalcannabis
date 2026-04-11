import { SEO_MAP } from "@/lib/seo/seoMap.generated";
import { listCountryPageCodes } from "@/lib/countryPageStorage";

export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const entries = SEO_MAP.map((entry) => ({
    url: `${baseUrl}/is-cannabis-legal-in-${entry.slug}`,
    changefreq: "weekly",
    priority: 0.7
  }));
  const countryEntries = listCountryPageCodes().map((code) => ({
    url: `${baseUrl}/c/${code}`,
    changefreq: "weekly" as const,
    priority: 0.75
  }));

  return [
    {
      url: `${baseUrl}/check`,
      changefreq: "weekly",
      priority: 0.8
    },
    {
      url: `${baseUrl}/`,
      changefreq: "weekly",
      priority: 1
    },
    ...countryEntries,
    ...entries
  ];
}
