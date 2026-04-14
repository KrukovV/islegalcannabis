import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CountrySeoPage, { getCountrySeoTitle } from "@/app/_components/CountrySeoPage";
import { getCountryPageData, listCountryPageCodes } from "@/lib/countryPageStorage";
import { buildSeoLanguageAlternates, isSeoAltLocale, type SeoAltLocale } from "@/lib/seo/i18n";
import { getEffectiveSeoLocale, getSeoTranslation, listSeoTranslationEntries, type SeoLocale } from "@/lib/seo/wikiLocaleContent";

export const revalidate = 604800;

export async function generateStaticParams() {
  const codeSet = new Set(listCountryPageCodes());
  return listSeoTranslationEntries()
    .filter((entry) => codeSet.has(entry.code))
    .map((entry) => ({ lang: entry.locale, code: entry.code }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string; code: string }>;
}): Promise<Metadata> {
  const { lang, code } = await params;
  if (!isSeoAltLocale(lang)) {
    return {
      title: "Country not found",
      robots: { index: false, follow: false }
    };
  }
  const data = getCountryPageData(code);
  if (!data) {
    return {
      title: "Country not found",
      robots: { index: false, follow: false }
    };
  }
  const requestedLocale = lang as SeoAltLocale;
  const locale = getEffectiveSeoLocale(data.code, requestedLocale);
  const heading = getCountrySeoTitle(data, locale);
  const localizedSummary = locale === "en" ? data.notes_normalized : getSeoTranslation(data.code, requestedLocale)?.summary || data.notes_normalized;
  return {
    title: heading,
    description: localizedSummary,
    alternates: {
      canonical: locale === "en" ? `/c/${data.code}` : `/${requestedLocale}/c/${data.code}`,
      languages: buildSeoLanguageAlternates(data.code)
    },
    openGraph: {
      title: heading,
      description: localizedSummary,
      url: locale === "en" ? `https://islegal.info/c/${data.code}` : `https://islegal.info/${requestedLocale}/c/${data.code}`,
      type: "article"
    }
  };
}

export default async function LocalizedCountryCodePage({
  params,
  searchParams
}: {
  params: Promise<{ lang: string; code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang, code } = await params;
  if (!isSeoAltLocale(lang)) notFound();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = typeof resolvedSearchParams?.q === "string" ? resolvedSearchParams.q : null;
  const data = getCountryPageData(code);
  if (!data) notFound();
  const locale = getEffectiveSeoLocale(data.code, lang as SeoAltLocale) as SeoLocale;
  return <CountrySeoPage data={data} locale={locale} query={query} />;
}
