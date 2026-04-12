import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CountrySeoPage, { getCountrySeoTitle } from "@/app/_components/CountrySeoPage";
import { getCountryPageData, listCountryPageCodes } from "@/lib/countryPageStorage";
import { buildSeoLanguageAlternates, isSeoAltLocale, type SeoAltLocale } from "@/lib/seo/i18n";

export const revalidate = 604800;

export async function generateStaticParams() {
  const codes = listCountryPageCodes();
  return ["es", "fr", "de"].flatMap((lang) => codes.map((code) => ({ lang, code })));
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
  const locale = lang as SeoAltLocale;
  const heading = getCountrySeoTitle(data, locale);
  return {
    title: heading,
    description: data.notes_normalized,
    alternates: {
      canonical: `/c/${data.code}`,
      languages: buildSeoLanguageAlternates(data.code)
    },
    openGraph: {
      title: heading,
      description: data.notes_normalized,
      url: `https://islegal.info/${locale}/c/${data.code}`,
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
  return <CountrySeoPage data={data} locale={lang as SeoAltLocale} query={query} />;
}
