import type { CountryPageData } from "@/lib/countryPageStorage";

export type ParentCountryHint = {
  code?: string;
  name: string;
};

const TERRITORY_PARENT_BY_GEO: Record<string, ParentCountryHint> = {
  AI: { code: "GBR", name: "United Kingdom" },
  AW: { code: "NLD", name: "Netherlands" },
  AX: { code: "FIN", name: "Finland" },
  AS: { code: "USA", name: "United States" },
  BQ: { code: "NLD", name: "Netherlands" },
  BV: { code: "NOR", name: "Norway" },
  CC: { code: "AUS", name: "Australia" },
  CK: { code: "NZL", name: "New Zealand" },
  CX: { code: "AUS", name: "Australia" },
  FK: { code: "GBR", name: "United Kingdom" },
  FO: { code: "DNK", name: "Denmark" },
  GF: { code: "FRA", name: "France" },
  GI: { code: "GBR", name: "United Kingdom" },
  GL: { code: "DNK", name: "Denmark" },
  GU: { code: "USA", name: "United States" },
  IO: { code: "GBR", name: "United Kingdom" },
  MF: { code: "FRA", name: "France" },
  MQ: { code: "FRA", name: "France" },
  MP: { code: "USA", name: "United States" },
  NF: { code: "AUS", name: "Australia" },
  PM: { code: "FRA", name: "France" },
  PN: { code: "GBR", name: "United Kingdom" },
  PR: { code: "USA", name: "United States" },
  RE: { code: "FRA", name: "France" },
  SH: { code: "GBR", name: "United Kingdom" },
  SJ: { code: "NOR", name: "Norway" },
  TC: { code: "GBR", name: "United Kingdom" },
  TF: { code: "FRA", name: "France" },
  TK: { code: "NZL", name: "New Zealand" },
  UM: { code: "USA", name: "United States" },
  VI: { code: "USA", name: "United States" },
  VG: { code: "GBR", name: "United Kingdom" },
  WF: { code: "FRA", name: "France" },
  YT: { code: "FRA", name: "France" },
  MO: { code: "CHN", name: "China" },
  HK: { code: "CHN", name: "China" }
};

const PARENT_PARENT_KEYWORDS: Array<{ pattern: RegExp; parentName: string; parentCode?: string }> = [
  {
    pattern: /\b(united states|u\.s\.|usa|american\s+sovereignty)\b/i,
    parentName: "United States",
    parentCode: "USA"
  },
  {
    pattern: /\baustralian|australia|pacta\s+with\s+australia\b/i,
    parentName: "Australia",
    parentCode: "AUS"
  },
  {
    pattern: /\bfrench|guadeloupe|martinique|mayotte|réunion|french\s+guiana|french\s+guian[a]?|french\s+south/i,
    parentName: "France",
    parentCode: "FRA"
  },
  {
    pattern: /\bdenmark|danish\s+outlying\s+islands|follows\s+danish|danish law/i,
    parentName: "Denmark",
    parentCode: "DNK"
  },
  {
    pattern: /\bnorway|svalbard|jan\s+mayen|norwegian\s+sovereignty/i,
    parentName: "Norway",
    parentCode: "NOR"
  },
  {
    pattern: /\bunited kingdom|british|uk\s+overseas|british\s+dependent|british crown/i,
    parentName: "United Kingdom",
    parentCode: "GBR"
  },
  {
    pattern: /\bnew\s+zealand|cooks?\s+islands|tokelau|cook islands/i,
    parentName: "New Zealand",
    parentCode: "NZL"
  },
  {
    pattern: /\bchina|hong\s+kong|macau|macao/i,
    parentName: "China",
    parentCode: "CHN"
  }
];

const FALLBACK_PARENT_SUMMARY = "This jurisdiction's legal rules are defined by its parent jurisdiction.";

function stripCountryCodeSuffix(text: string) {
  return String(text || "").replace(/\s*\(.*?\)\s*$/, "").trim();
}

export function inferParentCountryFromGeoCode(geoCode: string | null | undefined): ParentCountryHint | null {
  const normalized = String(geoCode || "").trim().toUpperCase();
  if (!normalized) return null;
  return TERRITORY_PARENT_BY_GEO[normalized] ?? null;
}

export function inferParentCountryFromCountryData(data: CountryPageData): ParentCountryHint | null {
  if (data.parent_country?.name) {
    return {
      code: data.parent_country.code,
      name: data.parent_country.name
    };
  }

  const fromGeo = inferParentCountryFromGeoCode(data.geo_code);
  if (fromGeo) return fromGeo;

  const joinedText = `${data.notes_normalized || ""} ${data.notes_raw || ""} ${data.name || ""} ${
    data.iso2 || ""
  } ${data.geo_code || ""}`;

  for (const match of PARENT_PARENT_KEYWORDS) {
    if (match.pattern.test(joinedText)) {
      return {
        code: match.parentCode,
        name: match.parentName
      };
    }
  }

  return null;
}

export function buildTerritoryParentLawSummary(parentName: string | null | undefined, countryName: string | null | undefined) {
  const parent = parentName?.trim();
  const target = countryName?.trim() || "This territory";
  if (!parent) return FALLBACK_PARENT_SUMMARY;
  return `${target} belongs to ${parent} and follows ${parent}'s laws.`;
}

export function inferJurisdictionContextNotes(
  dataOrNotes: CountryPageData | { parentCountryName?: string; notes?: string; countryName?: string },
  parentCountry: ParentCountryHint | null,
  opts: { countryName?: string; category?: string } = {}
): string[] {
  const parentName = parentCountry?.name;
  const notes = "notes" in dataOrNotes ? dataOrNotes.notes || "" : "";
  const countryName = opts.countryName || ("name" in dataOrNotes ? dataOrNotes.name : null);

  if (parentName && opts.category === "state") {
    const target = stripCountryCodeSuffix(countryName || "This state");
    return [`State-level rules for ${target} can differ from ${parentName} nationwide laws.`];
  }

  if (!parentName) return [];

  const target = countryName || "This territory";
  const context = buildTerritoryParentLawSummary(parentName, target);
  const normalized = String(notes || "").toLowerCase();
  const inheritedNotes = PARENT_PARENT_KEYWORDS.some((pattern) => pattern.pattern.test(normalized))
    ? "Local legal practice and penalties are commonly applied through the parent’s enforcement framework."
    : null;

  return inheritedNotes ? [context, inheritedNotes] : [context];
}
