import { SEO_MAP } from "./seoMap.generated";

export function getSeoEntryBySlug(slug: string) {
  return SEO_MAP.find((entry) => entry.slug === slug) ?? null;
}

export function parseJurisdictionKey(key: string) {
  const [country, region] = key.split("-");
  return { country, region: region || undefined };
}
