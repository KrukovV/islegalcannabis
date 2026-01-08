import rawTop25 from "./top25.json";

export type Top25Entry = {
  jurisdictionKey: string;
  country: string;
  region?: string;
  slug: string;
  displayName: string;
};

export const TOP25: Top25Entry[] = rawTop25.map((entry) => ({
  jurisdictionKey: entry.jurisdictionKey,
  country: entry.country,
  region: entry.region,
  slug: entry.slug,
  displayName: entry.displayName ?? entry.slug
}));

export const TOP25_KEYS = TOP25.map((entry) => entry.jurisdictionKey);
