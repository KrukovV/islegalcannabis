import type { CountryPageData } from "@/lib/countryPageStorage";
import { getDisplayName } from "@/lib/countryNames";
import {
  SEO_ALT_LOCALES,
  SEO_LOCALES,
  buildSeoLanguageAlternates,
  getEffectiveSeoLocale,
  getSeoLocaleHref,
  getSeoTranslation,
  type SeoAltLocale,
  type SeoLocale
} from "@/lib/seo/wikiLocaleContent";
export { SEO_ALT_LOCALES, SEO_LOCALES, getSeoLocaleHref, buildSeoLanguageAlternates };
export type { SeoAltLocale, SeoLocale };

export function isSeoAltLocale(value: string): value is SeoAltLocale {
  return SEO_ALT_LOCALES.includes(value as SeoAltLocale);
}

export function isSeoLocale(value: string | null | undefined): value is SeoLocale {
  return SEO_LOCALES.includes(String(value || "").trim().toLowerCase() as SeoLocale);
}

type LocaleCopy = {
  title: (_name: string) => string;
  eyebrowCountry: string;
  eyebrowState: string;
  recreational: string;
  medical: string;
  distribution: string;
  risk: string;
  keyFacts: string;
  relatedPlaces: string;
  possession: string;
  cultivation: string;
  penalty: string;
};

const ALT_COPY: Record<SeoAltLocale, LocaleCopy> = {
  es: {
    title: (name) => `¿Es legal el cannabis en ${name}?`,
    eyebrowCountry: "Vista del país",
    eyebrowState: "Vista del estado",
    recreational: "Recreativo",
    medical: "Medicinal",
    distribution: "Distribución",
    risk: "Riesgo",
    keyFacts: "Datos clave",
    relatedPlaces: "Lugares relacionados",
    possession: "Posesión",
    cultivation: "Cultivo",
    penalty: "Sanción"
  },
  fr: {
    title: (name) => `Le cannabis est-il légal en ${name} ?`,
    eyebrowCountry: "Vue du pays",
    eyebrowState: "Vue de l'État",
    recreational: "Récréatif",
    medical: "Médical",
    distribution: "Distribution",
    risk: "Risque",
    keyFacts: "Faits clés",
    relatedPlaces: "Lieux liés",
    possession: "Possession",
    cultivation: "Culture",
    penalty: "Sanction"
  },
  de: {
    title: (name) => `Ist Cannabis in ${name} legal?`,
    eyebrowCountry: "Länderansicht",
    eyebrowState: "Bundesstaat-Ansicht",
    recreational: "Freizeit",
    medical: "Medizinisch",
    distribution: "Vertrieb",
    risk: "Risiko",
    keyFacts: "Wichtige Fakten",
    relatedPlaces: "Verwandte Orte",
    possession: "Besitz",
    cultivation: "Anbau",
    penalty: "Strafe"
  },
  pt: {
    title: (name) => `A cannabis é legal em ${name}?`,
    eyebrowCountry: "Visão do país",
    eyebrowState: "Visão do estado",
    recreational: "Recreativo",
    medical: "Medicinal",
    distribution: "Distribuição",
    risk: "Risco",
    keyFacts: "Fatos principais",
    relatedPlaces: "Locais relacionados",
    possession: "Posse",
    cultivation: "Cultivo",
    penalty: "Penalidade"
  },
  nl: {
    title: (name) => `Is cannabis legaal in ${name}?`,
    eyebrowCountry: "Landweergave",
    eyebrowState: "Staatweergave",
    recreational: "Recreatief",
    medical: "Medisch",
    distribution: "Distributie",
    risk: "Risico",
    keyFacts: "Kernfeiten",
    relatedPlaces: "Gerelateerde plaatsen",
    possession: "Bezit",
    cultivation: "Teelt",
    penalty: "Straf"
  }
};

const STATUS_LABELS: Record<SeoAltLocale, Record<string, string>> = {
  es: {
    LEGAL: "legal",
    MIXED: "mixto",
    DECRIM: "despenalizado",
    ILLEGAL: "ilegal",
    UNKNOWN: "desconocido",
    TOLERATED: "tolerado",
    DECRIMINALIZED: "despenalizado",
    LIMITED: "limitado"
  },
  fr: {
    LEGAL: "légal",
    MIXED: "mixte",
    DECRIM: "décriminalisé",
    ILLEGAL: "illégal",
    UNKNOWN: "inconnu",
    TOLERATED: "toléré",
    DECRIMINALIZED: "décriminalisé",
    LIMITED: "limité"
  },
  de: {
    LEGAL: "legal",
    MIXED: "gemischt",
    DECRIM: "entkriminalisiert",
    ILLEGAL: "illegal",
    UNKNOWN: "unbekannt",
    TOLERATED: "geduldet",
    DECRIMINALIZED: "entkriminalisiert",
    LIMITED: "begrenzt"
  },
  pt: {
    LEGAL: "legal",
    MIXED: "misto",
    DECRIM: "descriminalizado",
    ILLEGAL: "ilegal",
    UNKNOWN: "desconhecido",
    TOLERATED: "tolerado",
    DECRIMINALIZED: "descriminalizado",
    LIMITED: "limitado"
  },
  nl: {
    LEGAL: "legaal",
    MIXED: "gemengd",
    DECRIM: "gedecriminaliseerd",
    ILLEGAL: "illegaal",
    UNKNOWN: "onbekend",
    TOLERATED: "gedoogd",
    DECRIMINALIZED: "gedecriminaliseerd",
    LIMITED: "beperkt"
  }
};

export function getLocalizedCountryName(data: CountryPageData, locale: SeoLocale) {
  return getDisplayName(data.iso2, locale) || data.name;
}

function translateStatus(locale: SeoAltLocale, status: string | null | undefined) {
  const normalized = String(status || "").trim().toUpperCase();
  return STATUS_LABELS[locale][normalized] || String(status || "").trim().toLowerCase() || "unknown";
}

export function getLocalizedSeoTitle(data: CountryPageData, locale: SeoAltLocale) {
  return ALT_COPY[locale].title(getLocalizedCountryName(data, locale));
}

export function getLocalizedSeoIntro(data: CountryPageData, locale: SeoAltLocale) {
  if (getEffectiveSeoLocale(data.code, locale) !== locale) {
    return data.notes_normalized;
  }
  const translation = getSeoTranslation(data.code, locale);
  if (translation?.summary) {
    return translation.summary;
  }
  const name = getLocalizedCountryName(data, locale);
  const rec = translateStatus(locale, data.legal_model.recreational.status);
  const med = translateStatus(locale, data.legal_model.medical.status);
  const distribution = translateStatus(locale, data.legal_model.distribution.status);
  switch (locale) {
    case "es":
      return `El cannabis recreativo es ${rec} en ${name}. El cannabis medicinal es ${med}. La distribución es ${distribution}.`;
    case "fr":
      return `Le cannabis récréatif est ${rec} en ${name}. Le cannabis médical est ${med}. La distribution est ${distribution}.`;
    case "de":
      return `Cannabis zum Freizeitgebrauch ist in ${name} ${rec}. Medizinisches Cannabis ist ${med}. Der Vertrieb ist ${distribution}.`;
  }
}

export function getLocaleCopy(locale: SeoAltLocale) {
  return ALT_COPY[locale];
}

export function getSeoText(locale: SeoLocale) {
  if (locale === "en") {
    return {
      title: (name: string) => `Is cannabis legal in ${name}?`,
      countryPrefix: "Country View",
      statePrefix: "State View",
      recreational: "Recreational",
      medical: "Medical",
      distribution: "Distribution",
      risk: "Risk",
      keyFacts: "Key facts",
      relatedPlaces: "Related places",
      intro: (data: CountryPageData) => data.notes_normalized
    };
  }
  const copy = ALT_COPY[locale];
  return {
    title: copy.title,
    countryPrefix: copy.eyebrowCountry,
    statePrefix: copy.eyebrowState,
    recreational: copy.recreational,
    medical: copy.medical,
    distribution: copy.distribution,
    risk: copy.risk,
    keyFacts: copy.keyFacts,
    relatedPlaces: copy.relatedPlaces,
    intro: (data: CountryPageData) => getLocalizedSeoIntro(data, locale)
  };
}
