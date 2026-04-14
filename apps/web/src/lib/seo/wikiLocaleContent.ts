import seoI18nPriority from "../../../../../data/wiki/cache/seo_i18n_priority.json";

export const SEO_LOCALES = ["en", "es", "pt", "de", "fr", "nl"] as const;
export const SEO_ALT_LOCALES = ["es", "pt", "de", "fr", "nl"] as const;
export type SeoLocale = (typeof SEO_LOCALES)[number];
export type SeoAltLocale = (typeof SEO_ALT_LOCALES)[number];

type SeoTranslation = {
  title: string;
  summary: string;
  url: string;
};

export type SeoTranslationCache = {
  generatedAt: string;
  locales: string[];
  scope: {
    countries: string[];
    states: string;
  };
  entries: Record<
    string,
    {
      source: {
        title: string;
        url: string;
      };
      translations: Partial<Record<SeoAltLocale, SeoTranslation>>;
    }
  >;
};

const PRIORITY_COUNTRY_CODES = new Set(["usa", "nld", "deu", "fra", "esp", "prt", "bra", "tha"]);
const EMPTY_CACHE: SeoTranslationCache = {
  generatedAt: "",
  locales: [...SEO_ALT_LOCALES],
  scope: {
    countries: Array.from(PRIORITY_COUNTRY_CODES),
    states: "us-*"
  },
  entries: {}
};

const cacheValue = (seoI18nPriority || EMPTY_CACHE) as SeoTranslationCache;

function loadCache() {
  return cacheValue;
}

export function isSeoAltLocale(value: string): value is SeoAltLocale {
  return SEO_ALT_LOCALES.includes(value as SeoAltLocale);
}

export function isSeoLocale(value: string | null | undefined): value is SeoLocale {
  return SEO_LOCALES.includes(String(value || "").trim().toLowerCase() as SeoLocale);
}

export function isSeoPriorityCode(code: string | null | undefined) {
  const normalized = String(code || "").trim().toLowerCase();
  return normalized.startsWith("us-") || PRIORITY_COUNTRY_CODES.has(normalized);
}

export function getSeoLocaleHref(code: string, locale: SeoLocale) {
  return locale === "en" ? `/c/${code}` : `/${locale}/c/${code}`;
}

export function getSeoTranslation(code: string, locale: SeoAltLocale) {
  return loadCache().entries[String(code || "").trim().toLowerCase()]?.translations?.[locale] || null;
}

export function hasSeoTranslation(code: string, locale: SeoAltLocale) {
  return Boolean(getSeoTranslation(code, locale));
}

export function listSeoTranslationEntries() {
  return Object.entries(loadCache().entries).flatMap(([code, entry]) =>
    Object.entries(entry.translations || {}).map(([locale, translation]) => ({
      code,
      locale: locale as SeoAltLocale,
      translation: translation as SeoTranslation
    }))
  );
}

export function buildSeoLanguageAlternates(code: string) {
  const alternates: Partial<Record<SeoLocale, string>> = {
    en: getSeoLocaleHref(code, "en")
  };
  for (const locale of SEO_ALT_LOCALES) {
    if (hasSeoTranslation(code, locale)) {
      alternates[locale] = getSeoLocaleHref(code, locale);
    }
  }
  return alternates as Record<string, string>;
}

export function getEffectiveSeoLocale(code: string, locale: SeoLocale) {
  if (locale === "en") return "en" as const;
  return hasSeoTranslation(code, locale) ? locale : "en";
}

function parseAcceptLanguage(value: string | null | undefined) {
  return String(value || "")
    .split(",")
    .map((token) => {
      const [rawTag, ...params] = token.trim().split(";");
      const qToken = params.find((part) => part.trim().startsWith("q="));
      const qValue = qToken ? Number.parseFloat(qToken.trim().slice(2)) : 1;
      return {
        tag: rawTag.trim().toLowerCase(),
        q: Number.isFinite(qValue) ? qValue : 0
      };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.q - a.q);
}

export function pickPreferredSeoLocale(value: string | null | undefined): SeoAltLocale | null {
  for (const entry of parseAcceptLanguage(value)) {
    const base = entry.tag.split("-")[0] || "";
    if (isSeoAltLocale(base)) {
      return base;
    }
  }
  return null;
}

function extractCanonicalSeoCode(pathname: string) {
  const match = /^\/c\/([a-z0-9-]+)$/i.exec(pathname);
  return match ? match[1].toLowerCase() : null;
}

function extractLocalizedSeoRoute(pathname: string) {
  const match = /^\/([a-z]{2})\/c\/([a-z0-9-]+)$/i.exec(pathname);
  if (!match) return null;
  const locale = match[1].toLowerCase();
  const code = match[2].toLowerCase();
  if (!isSeoAltLocale(locale)) return null;
  return { locale, code };
}

export function resolveSeoRouteLocale(pathname: string): SeoLocale {
  const localized = extractLocalizedSeoRoute(pathname);
  if (localized) {
    return getEffectiveSeoLocale(localized.code, localized.locale);
  }
  return "en";
}

export function resolveBrowserLocaleRedirect(pathname: string, acceptLanguage: string | null | undefined) {
  if (pathname === "/") return null;
  if (extractLocalizedSeoRoute(pathname)) return null;
  const code = extractCanonicalSeoCode(pathname);
  if (!code) return null;
  const locale = pickPreferredSeoLocale(acceptLanguage);
  if (!locale) return null;
  if (!hasSeoTranslation(code, locale)) return null;
  return getSeoLocaleHref(code, locale);
}
