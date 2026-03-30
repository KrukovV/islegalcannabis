import { getCountryMetaByIso2 } from "@/lib/countryNames";

export type WikiTruthResolutionReason =
  | "NO_WIKI_ROW"
  | "TITLE_ALIAS_MISS"
  | "ISO_ALIAS_MISS"
  | "TERRITORY_NOT_IN_WIKI_SCOPE"
  | "PARSER_LEFTOVER"
  | "EMPTY_ISO"
  | "INVALID_ISO";

export type WikiTruthExpectedPageReason =
  | "CANNABIS_SOURCE_PAGE"
  | "CLAIM_WIKI_ROW"
  | "COUNTRY_META_TITLE"
  | "NO_WIKI_ROW";

export type WikiTruthUniverseItem = {
  iso2?: string;
  country?: string;
  country_name?: string;
  expected_wiki_url?: string;
  expected_wiki_page_url?: string;
  from_cannabis_by_country?: boolean;
};

export type WikiTruthClaimItem = {
  wiki_row_url?: string;
  country?: string;
  name?: string;
  geo_name?: string;
};

export type WikiTruthExpectedPageResolution = {
  iso2: string;
  canonicalTitle: string | null;
  expectedWikiPage: string | null;
  reason: WikiTruthExpectedPageReason;
};

export function normalizeCountryKey(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isIso2(value: string): boolean {
  return /^[A-Z]{2}$/.test(String(value || "").toUpperCase());
}

export function decodeWikiTitleFromUrl(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const pathname = new URL(raw).pathname;
    const slug = pathname.split("/wiki/")[1] || "";
    return decodeURIComponent(slug).replaceAll("_", " ").trim();
  } catch {
    return "";
  }
}

export function isWikipediaUrl(url: string): boolean {
  const raw = String(url || "").trim();
  return /^https?:\/\/([a-z]+\.)?wikipedia\.org\/wiki\//i.test(raw);
}

export function buildWikiUrlFromTitle(title: string): string | null {
  const normalized = String(title || "").trim();
  if (!normalized) return null;
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(normalized.replaceAll(" ", "_"))}`;
}

function normalizeWikiPath(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw;
  }
}

function resolveCanonicalTitle(input: {
  iso2: string;
  countryName?: string;
  claimWikiUrl?: string;
}) {
  const claimTitle = normalizeWikiDisplayTitle(input.claimWikiUrl || "");
  if (claimTitle) return claimTitle;
  const meta = getCountryMetaByIso2(input.iso2);
  return (
    meta?.englishName ||
    meta?.commonName ||
    meta?.officialName ||
    String(input.countryName || "").trim() ||
    null
  );
}

export function resolveExpectedWikiPage(input: {
  iso2?: string;
  countryName?: string;
  expectedWikiUrl?: string;
  claimWikiUrl?: string;
  fromCannabisByCountry?: boolean;
}): WikiTruthExpectedPageResolution {
  const iso2 = String(input.iso2 || "").trim().toUpperCase();
  const canonicalTitle = resolveCanonicalTitle({
    iso2,
    countryName: input.countryName,
    claimWikiUrl: input.claimWikiUrl
  });
  const currentExpected = normalizeWikiPath(input.expectedWikiUrl || "");
  const claimWikiUrl = normalizeWikiPath(input.claimWikiUrl || "");

  if (isWikipediaUrl(claimWikiUrl)) {
    return {
      iso2,
      canonicalTitle: normalizeWikiDisplayTitle(claimWikiUrl) || canonicalTitle,
      expectedWikiPage: claimWikiUrl,
      reason: "CLAIM_WIKI_ROW"
    };
  }
  if (input.fromCannabisByCountry && isWikipediaUrl(currentExpected)) {
    return {
      iso2,
      canonicalTitle: normalizeWikiDisplayTitle(currentExpected) || canonicalTitle,
      expectedWikiPage: currentExpected,
      reason: "CANNABIS_SOURCE_PAGE"
    };
  }
  if (canonicalTitle) {
    return {
      iso2,
      canonicalTitle,
      expectedWikiPage: buildWikiUrlFromTitle(canonicalTitle),
      reason: "COUNTRY_META_TITLE"
    };
  }
  return {
    iso2,
    canonicalTitle: null,
    expectedWikiPage: null,
    reason: "NO_WIKI_ROW"
  };
}

export function buildExpectedWikiPageByIso(input: {
  wikiUniverseItems?: WikiTruthUniverseItem[];
  claimsItems?: Record<string, WikiTruthClaimItem>;
}) {
  const out: Record<string, string> = {};
  const items = Array.isArray(input.wikiUniverseItems) ? input.wikiUniverseItems : [];
  const claimsItems = input.claimsItems && typeof input.claimsItems === "object" ? input.claimsItems : {};
  for (const row of items) {
    const iso2 = String(row?.iso2 || "").trim().toUpperCase();
    if (!isIso2(iso2)) continue;
    const claim = claimsItems[iso2];
    const resolved = resolveExpectedWikiPage({
      iso2,
      countryName: String(row?.country_name || row?.country || claim?.country || claim?.name || claim?.geo_name || "").trim(),
      expectedWikiUrl: String(row?.expected_wiki_page_url || row?.expected_wiki_url || "").trim(),
      claimWikiUrl: String(claim?.wiki_row_url || "").trim(),
      fromCannabisByCountry: Boolean(row?.from_cannabis_by_country)
    });
    if (resolved.expectedWikiPage && isWikipediaUrl(resolved.expectedWikiPage)) {
      out[iso2] = resolved.expectedWikiPage;
    }
  }
  return out;
}

export function normalizeWikiDisplayTitle(value: string): string {
  return decodeWikiTitleFromUrl(value) || String(value || "").replaceAll("_", " ").trim();
}

export function classifyGarbageRow(input: { iso2?: string; country?: string }): WikiTruthResolutionReason | null {
  const iso2 = String(input.iso2 || "").trim().toUpperCase();
  const country = String(input.country || "").trim();
  if (/^country\/territory$/i.test(country)) return "PARSER_LEFTOVER";
  if (!iso2) return "EMPTY_ISO";
  if (!isIso2(iso2)) return "INVALID_ISO";
  return null;
}

export function resolveAliasReason(input: {
  hasClaim: boolean;
  expectedWikiUrl?: string;
  actualWikiUrl?: string;
  type?: string;
}): WikiTruthResolutionReason {
  if (input.type === "state") return "NO_WIKI_ROW";
  if (input.hasClaim && input.expectedWikiUrl && input.actualWikiUrl) {
    const expectedTitle = normalizeWikiDisplayTitle(input.expectedWikiUrl);
    const actualTitle = normalizeWikiDisplayTitle(input.actualWikiUrl);
    if (expectedTitle && actualTitle && expectedTitle !== actualTitle) return "TITLE_ALIAS_MISS";
  }
  if (input.hasClaim) return "ISO_ALIAS_MISS";
  if (!input.expectedWikiUrl) return "TERRITORY_NOT_IN_WIKI_SCOPE";
  return "NO_WIKI_ROW";
}
