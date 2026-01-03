import caJson from "../../../../data/laws/us/CA.json";
import deJson from "../../../../data/laws/eu/DE.json";
import nyJson from "../../../../data/laws/us/NY.json";
import flJson from "../../../../data/laws/us/FL.json";
import txJson from "../../../../data/laws/us/TX.json";
import waJson from "../../../../data/laws/us/WA.json";
import nlJson from "../../../../data/laws/eu/NL.json";
import frJson from "../../../../data/laws/eu/FR.json";
import esJson from "../../../../data/laws/eu/ES.json";
import type { JurisdictionLawProfile } from "@islegal/shared";

export type LawRegistryKey =
  | "US-CA"
  | "US-NY"
  | "US-FL"
  | "US-TX"
  | "US-WA"
  | "DE"
  | "NL"
  | "FR"
  | "ES";

const ca = caJson as JurisdictionLawProfile;
const de = deJson as JurisdictionLawProfile;
const ny = nyJson as JurisdictionLawProfile;
const fl = flJson as JurisdictionLawProfile;
const tx = txJson as JurisdictionLawProfile;
const wa = waJson as JurisdictionLawProfile;
const nl = nlJson as JurisdictionLawProfile;
const fr = frJson as JurisdictionLawProfile;
const es = esJson as JurisdictionLawProfile;

export const lawRegistry: Record<LawRegistryKey, JurisdictionLawProfile> = {
  "US-CA": ca,
  "US-NY": ny,
  "US-FL": fl,
  "US-TX": tx,
  "US-WA": wa,
  DE: de,
  NL: nl,
  FR: fr,
  ES: es
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
