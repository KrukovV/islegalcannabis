import { SEO_MAP } from "@/lib/seo/seoMap.generated";

export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const entries = SEO_MAP.map((entry) => ({
    url: `${baseUrl}/is-cannabis-legal-in-${entry.slug}`,
    changefreq: "weekly",
    priority: 0.7
  }));

  return [
    {
      url: `${baseUrl}/check`,
      changefreq: "weekly",
      priority: 0.8
    },
    ...entries
  ];
}
