import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CountrySeoPage, { getCountrySeoTitle } from "@/app/_components/CountrySeoPage";
import { getCountryPageData, listCountryPageCodes } from "@/lib/countryPageStorage";
import { buildSeoLanguageAlternates } from "@/lib/seo/i18n";

export const revalidate = 604800;

export async function generateStaticParams() {
  return listCountryPageCodes().map((code) => ({ code }));
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const data = getCountryPageData(code);
  if (!data) {
    return {
      title: "Country not found",
      robots: {
        index: false,
        follow: false
      }
    };
  }
  const heading = getCountrySeoTitle(data, "en");
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
      url: `https://www.islegal.info/c/${data.code}`,
      type: "article"
    }
  };
}

export default async function CountryCodePage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = typeof resolvedSearchParams?.q === "string" ? resolvedSearchParams.q : null;
  const data = getCountryPageData(code);
  if (!data) notFound();
  return <CountrySeoPage data={data} locale="en" query={query} />;
}
