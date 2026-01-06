import caJson from "../../../../data/laws/us/CA.json";
import deJson from "../../../../data/laws/eu/DE.json";
import nyJson from "../../../../data/laws/us/NY.json";
import flJson from "../../../../data/laws/us/FL.json";
import txJson from "../../../../data/laws/us/TX.json";
import waJson from "../../../../data/laws/us/WA.json";
import ilJson from "../../../../data/laws/us/IL.json";
import maJson from "../../../../data/laws/us/MA.json";
import azJson from "../../../../data/laws/us/AZ.json";
import coJson from "../../../../data/laws/us/CO.json";
import ctJson from "../../../../data/laws/us/CT.json";
import miJson from "../../../../data/laws/us/MI.json";
import njJson from "../../../../data/laws/us/NJ.json";
import nvJson from "../../../../data/laws/us/NV.json";
import ohJson from "../../../../data/laws/us/OH.json";
import orJson from "../../../../data/laws/us/OR.json";
import paJson from "../../../../data/laws/us/PA.json";
import vaJson from "../../../../data/laws/us/VA.json";
import atJson from "../../../../data/laws/eu/AT.json";
import beJson from "../../../../data/laws/eu/BE.json";
import czJson from "../../../../data/laws/eu/CZ.json";
import dkJson from "../../../../data/laws/eu/DK.json";
import fiJson from "../../../../data/laws/eu/FI.json";
import nlJson from "../../../../data/laws/eu/NL.json";
import frJson from "../../../../data/laws/eu/FR.json";
import esJson from "../../../../data/laws/eu/ES.json";
import itJson from "../../../../data/laws/eu/IT.json";
import grJson from "../../../../data/laws/eu/GR.json";
import ieJson from "../../../../data/laws/eu/IE.json";
import plJson from "../../../../data/laws/eu/PL.json";
import ptJson from "../../../../data/laws/eu/PT.json";
import seJson from "../../../../data/laws/eu/SE.json";
import type { JurisdictionLawProfile } from "@islegal/shared";

export type LawRegistryKey =
  | "US-CA"
  | "US-CO"
  | "US-CT"
  | "US-AZ"
  | "US-NY"
  | "US-FL"
  | "US-TX"
  | "US-WA"
  | "US-IL"
  | "US-MA"
  | "US-MI"
  | "US-NJ"
  | "US-NV"
  | "US-OH"
  | "US-OR"
  | "US-PA"
  | "US-VA"
  | "AT"
  | "BE"
  | "CZ"
  | "DK"
  | "FI"
  | "DE"
  | "GR"
  | "IE"
  | "NL"
  | "PL"
  | "PT"
  | "SE"
  | "FR"
  | "ES"
  | "IT";

const ca = caJson as JurisdictionLawProfile;
const de = deJson as JurisdictionLawProfile;
const ny = nyJson as JurisdictionLawProfile;
const fl = flJson as JurisdictionLawProfile;
const tx = txJson as JurisdictionLawProfile;
const wa = waJson as JurisdictionLawProfile;
const il = ilJson as JurisdictionLawProfile;
const ma = maJson as JurisdictionLawProfile;
const az = azJson as JurisdictionLawProfile;
const co = coJson as JurisdictionLawProfile;
const ct = ctJson as JurisdictionLawProfile;
const mi = miJson as JurisdictionLawProfile;
const nj = njJson as JurisdictionLawProfile;
const nv = nvJson as JurisdictionLawProfile;
const oh = ohJson as JurisdictionLawProfile;
const or = orJson as JurisdictionLawProfile;
const pa = paJson as JurisdictionLawProfile;
const va = vaJson as JurisdictionLawProfile;
const at = atJson as JurisdictionLawProfile;
const be = beJson as JurisdictionLawProfile;
const cz = czJson as JurisdictionLawProfile;
const dk = dkJson as JurisdictionLawProfile;
const fi = fiJson as JurisdictionLawProfile;
const nl = nlJson as JurisdictionLawProfile;
const fr = frJson as JurisdictionLawProfile;
const es = esJson as JurisdictionLawProfile;
const it = itJson as JurisdictionLawProfile;
const gr = grJson as JurisdictionLawProfile;
const ie = ieJson as JurisdictionLawProfile;
const pl = plJson as JurisdictionLawProfile;
const pt = ptJson as JurisdictionLawProfile;
const se = seJson as JurisdictionLawProfile;

export const lawRegistry: Record<LawRegistryKey, JurisdictionLawProfile> = {
  "US-CA": ca,
  "US-CO": co,
  "US-CT": ct,
  "US-AZ": az,
  "US-NY": ny,
  "US-FL": fl,
  "US-TX": tx,
  "US-WA": wa,
  "US-IL": il,
  "US-MA": ma,
  "US-MI": mi,
  "US-NJ": nj,
  "US-NV": nv,
  "US-OH": oh,
  "US-OR": or,
  "US-PA": pa,
  "US-VA": va,
  AT: at,
  BE: be,
  CZ: cz,
  DK: dk,
  FI: fi,
  DE: de,
  GR: gr,
  IE: ie,
  NL: nl,
  PL: pl,
  PT: pt,
  SE: se,
  FR: fr,
  ES: es,
  IT: it
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
