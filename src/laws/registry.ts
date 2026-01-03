import caJson from "@/laws/us/CA.json";
import deJson from "@/laws/eu/DE.json";
import type { JurisdictionLawProfile } from "@/lib/types";

export type LawRegistryKey = "US-CA" | "DE";

const ca = caJson as JurisdictionLawProfile;
const de = deJson as JurisdictionLawProfile;

export const lawRegistry: Record<LawRegistryKey, JurisdictionLawProfile> = {
  "US-CA": ca,
  DE: de
};

export function getStaticLawProfile(input: {
  country: string;
  region?: string;
}): JurisdictionLawProfile | null {
  const country = input.country.toUpperCase();
  const region = input.region?.toUpperCase();

  if (country === "US") {
    if (!region) return null;
    return lawRegistry[`US-${region}` as LawRegistryKey] ?? null;
  }

  return lawRegistry[country as LawRegistryKey] ?? null;
}
