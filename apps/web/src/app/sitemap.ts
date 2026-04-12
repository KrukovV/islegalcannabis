import type { MetadataRoute } from "next";
import { listCountryPageCodes } from "@/lib/countryPageStorage";
import { getBuildStamp } from "@/lib/buildStamp";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://islegal.info";
  const lastModified = new Date(getBuildStamp().buildTime);
  const countryEntries: MetadataRoute.Sitemap = listCountryPageCodes().map((code) => ({
    url: `${baseUrl}/c/${code}`,
    lastModified
  }));

  return [
    {
      url: `${baseUrl}/`,
      lastModified
    },
    ...countryEntries
  ];
}
