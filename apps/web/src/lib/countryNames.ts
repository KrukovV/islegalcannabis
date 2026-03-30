import countryNamesSnapshot from "@/lib/countryNames.snapshot.json";

type CountryNameVariant = {
  common?: string | null;
  official?: string | null;
};

type CountrySnapshotEntry = {
  cca2: string;
  cca3: string | null;
  name: {
    common?: string | null;
    official?: string | null;
    native?: Record<string, CountryNameVariant>;
  };
  translations?: Record<string, CountryNameVariant>;
  latlng?: [number, number] | null;
};

export type CountryMeta = {
  iso2: string;
  iso3: string | null;
  commonName: string | null;
  officialName: string | null;
  englishName: string | null;
  localName: string | null;
  bilingualLabel: string;
  latlng: [number, number] | null;
  nativeNames: Record<string, CountryNameVariant>;
  translations: Record<string, CountryNameVariant>;
};

const COUNTRY_ROWS = ((countryNamesSnapshot.countries || []) as unknown) as CountrySnapshotEntry[];

const COUNTRY_META_BY_ISO2 = new Map(
  COUNTRY_ROWS.map((entry) => {
    const iso2 = String(entry.cca2 || "").toUpperCase();
    const commonName = normalizeName(entry.name?.common);
    const officialName = normalizeName(entry.name?.official);
    const englishName = normalizeName(entry.translations?.eng?.common) || commonName;
    const localName = pickLocalName(entry, englishName || commonName || officialName);
    const bilingualLabel = buildBilingualLabel(englishName || commonName || officialName, localName, iso2);
    return [
      iso2,
      {
        iso2,
        iso3: normalizeName(entry.cca3),
        commonName,
        officialName,
        englishName: englishName || commonName || officialName,
        localName,
        bilingualLabel,
        latlng:
          Array.isArray(entry.latlng) && entry.latlng.length >= 2
            ? [Number(entry.latlng[0]), Number(entry.latlng[1])] as [number, number]
            : null,
        nativeNames: entry.name?.native || {},
        translations: entry.translations || {}
      } satisfies CountryMeta
    ];
  })
);

function normalizeIso2(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function normalizeName(value: string | null | undefined) {
  const next = String(value || "").trim();
  return next || null;
}

function canonicalName(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}

function pickLocalName(entry: CountrySnapshotEntry, englishCandidate: string | null) {
  const candidates = Object.values(entry.name?.native || {})
    .map((item) => normalizeName(item.common))
    .filter((item): item is string => Boolean(item));
  if (candidates.length === 0) return null;
  const canonicalEnglish = canonicalName(englishCandidate);
  return candidates.find((item) => canonicalName(item) !== canonicalEnglish) || candidates[0] || null;
}

function buildBilingualLabel(englishName: string | null, localName: string | null, iso2: string) {
  if (englishName && localName && canonicalName(englishName) !== canonicalName(localName)) {
    return `${englishName} / ${localName}`;
  }
  return englishName || localName || iso2;
}

export function getCountryMetaByIso2(iso2: string | null | undefined) {
  return COUNTRY_META_BY_ISO2.get(normalizeIso2(iso2)) || null;
}

export function getEnglishName(iso2: string | null | undefined) {
  const meta = getCountryMetaByIso2(iso2);
  return meta?.englishName || meta?.commonName || meta?.officialName || normalizeIso2(iso2) || null;
}

export function getLocalName(iso2: string | null | undefined) {
  return getCountryMetaByIso2(iso2)?.localName || null;
}

export function getBilingualLabel(iso2: string | null | undefined) {
  const meta = getCountryMetaByIso2(iso2);
  return meta?.bilingualLabel || getEnglishName(iso2) || normalizeIso2(iso2) || null;
}

export function getDisplayName(iso2: string | null | undefined, locale?: string | null) {
  const meta = getCountryMetaByIso2(iso2);
  const normalizedLocale = String(locale || "").trim().toLowerCase();
  if (!meta) return normalizeIso2(iso2) || null;
  if (!normalizedLocale) return meta.bilingualLabel;
  if (normalizedLocale === "en") return meta.englishName || meta.commonName || meta.officialName || meta.iso2;
  if (normalizedLocale === "local") return meta.localName || meta.englishName || meta.commonName || meta.iso2;
  const translated = normalizeName(meta.translations[normalizedLocale]?.common);
  if (translated) return translated;
  return meta.bilingualLabel;
}
