export type SlugMapping = {
  country: string;
  region?: string;
  displayName: string;
};

export const slugMap: Record<string, SlugMapping> = {
  germany: { country: "DE", displayName: "Germany" },
  netherlands: { country: "NL", displayName: "Netherlands" },
  france: { country: "FR", displayName: "France" },
  spain: { country: "ES", displayName: "Spain" },
  italy: { country: "IT", displayName: "Italy" },
  portugal: { country: "PT", displayName: "Portugal" },
  ireland: { country: "IE", displayName: "Ireland" },
  austria: { country: "AT", displayName: "Austria" },
  czechia: { country: "CZ", displayName: "Czechia" },
  poland: { country: "PL", displayName: "Poland" },
  denmark: { country: "DK", displayName: "Denmark" },
  sweden: { country: "SE", displayName: "Sweden" },
  finland: { country: "FI", displayName: "Finland" },
  greece: { country: "GR", displayName: "Greece" },
  belgium: { country: "BE", displayName: "Belgium" },
  california: { country: "US", region: "CA", displayName: "California" },
  "new-york": { country: "US", region: "NY", displayName: "New York" },
  florida: { country: "US", region: "FL", displayName: "Florida" },
  texas: { country: "US", region: "TX", displayName: "Texas" },
  washington: { country: "US", region: "WA", displayName: "Washington" },
  illinois: { country: "US", region: "IL", displayName: "Illinois" },
  massachusetts: { country: "US", region: "MA", displayName: "Massachusetts" },
  colorado: { country: "US", region: "CO", displayName: "Colorado" },
  nevada: { country: "US", region: "NV", displayName: "Nevada" },
  oregon: { country: "US", region: "OR", displayName: "Oregon" }
};
