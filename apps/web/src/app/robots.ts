import type { MetadataRoute } from "next";

const BASE_URL = "https://islegal.info";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    host: "islegal.info",
    sitemap: `${BASE_URL}/sitemap.xml`
  };
}
