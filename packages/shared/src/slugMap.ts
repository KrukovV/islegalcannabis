export type SlugMapping = {
  country: string;
  region?: string;
  displayName: string;
};

export const slugMap: Record<string, SlugMapping> = {
  california: { country: "US", region: "CA", displayName: "California" },
  germany: { country: "DE", displayName: "Germany" },
  "new-york": { country: "US", region: "NY", displayName: "New York" },
  florida: { country: "US", region: "FL", displayName: "Florida" },
  texas: { country: "US", region: "TX", displayName: "Texas" },
  washington: { country: "US", region: "WA", displayName: "Washington" },
  illinois: { country: "US", region: "IL", displayName: "Illinois" },
  massachusetts: { country: "US", region: "MA", displayName: "Massachusetts" },
  netherlands: { country: "NL", displayName: "Netherlands" },
  france: { country: "FR", displayName: "France" },
  spain: { country: "ES", displayName: "Spain" },
  italy: { country: "IT", displayName: "Italy" }
};
