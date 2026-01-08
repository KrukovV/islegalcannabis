import { TOP25 } from "./top25";

export type SlugMapping = {
  country: string;
  region?: string;
  displayName: string;
};

export const slugMap: Record<string, SlugMapping> = Object.fromEntries(
  TOP25.map((entry) => [
    entry.slug,
    {
      country: entry.country,
      region: entry.region,
      displayName: entry.displayName
    }
  ])
);
