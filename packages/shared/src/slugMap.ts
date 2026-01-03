export type SlugMapping = {
  country: string;
  region?: string;
  displayName: string;
};

export const slugMap: Record<string, SlugMapping> = {
  california: { country: "US", region: "CA", displayName: "California" },
  germany: { country: "DE", displayName: "Germany" }
};
