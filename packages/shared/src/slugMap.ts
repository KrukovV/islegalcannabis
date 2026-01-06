export type SlugMapping = {
  country: string;
  region?: string;
  displayName: string;
};

export const slugMap: Record<string, SlugMapping> = {
  arizona: { country: "US", region: "AZ", displayName: "Arizona" },
  austria: { country: "AT", displayName: "Austria" },
  belgium: { country: "BE", displayName: "Belgium" },
  california: { country: "US", region: "CA", displayName: "California" },
  colorado: { country: "US", region: "CO", displayName: "Colorado" },
  connecticut: { country: "US", region: "CT", displayName: "Connecticut" },
  czechia: { country: "CZ", displayName: "Czechia" },
  denmark: { country: "DK", displayName: "Denmark" },
  finland: { country: "FI", displayName: "Finland" },
  greece: { country: "GR", displayName: "Greece" },
  germany: { country: "DE", displayName: "Germany" },
  ireland: { country: "IE", displayName: "Ireland" },
  michigan: { country: "US", region: "MI", displayName: "Michigan" },
  "new-jersey": { country: "US", region: "NJ", displayName: "New Jersey" },
  "new-york": { country: "US", region: "NY", displayName: "New York" },
  nevada: { country: "US", region: "NV", displayName: "Nevada" },
  ohio: { country: "US", region: "OH", displayName: "Ohio" },
  oregon: { country: "US", region: "OR", displayName: "Oregon" },
  pennsylvania: { country: "US", region: "PA", displayName: "Pennsylvania" },
  portugal: { country: "PT", displayName: "Portugal" },
  sweden: { country: "SE", displayName: "Sweden" },
  virginia: { country: "US", region: "VA", displayName: "Virginia" },
  florida: { country: "US", region: "FL", displayName: "Florida" },
  texas: { country: "US", region: "TX", displayName: "Texas" },
  washington: { country: "US", region: "WA", displayName: "Washington" },
  illinois: { country: "US", region: "IL", displayName: "Illinois" },
  massachusetts: { country: "US", region: "MA", displayName: "Massachusetts" },
  netherlands: { country: "NL", displayName: "Netherlands" },
  poland: { country: "PL", displayName: "Poland" },
  france: { country: "FR", displayName: "France" },
  spain: { country: "ES", displayName: "Spain" },
  italy: { country: "IT", displayName: "Italy" }
};
