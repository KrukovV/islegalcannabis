import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CountrySeoPage, { ensureCountryPageHash, getCountrySeoTitle } from "@/app/_components/CountrySeoPage";
import TruthMapTerritorySeoPage from "@/app/_components/TruthMapTerritorySeoPage";
import { getCountryPageData, listCountryPageCodes } from "@/lib/countryPageStorage";
import { buildSeoLanguageAlternates } from "@/lib/seo/i18n";
import {
  getTruthMapCountryPageProjection,
  getTruthMapCountryPageProjectionForGeo,
  listTruthMapCountryPageProjectionGeos
} from "@/truth-map/truthMapCountryPage";

export const revalidate = 604800;

export async function generateStaticParams() {
  const legacyCodes = listCountryPageCodes();
  const mapOnlyCodes = listTruthMapCountryPageProjectionGeos()
    .filter((geo) => !getCountryPageData(geo.toLowerCase()))
    .map((geo) => geo.toLowerCase());
  return [...new Set([...legacyCodes, ...mapOnlyCodes])].map((code) => ({ code }));
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const data = getCountryPageData(code);
  const truthMapProjection = data
    ? getTruthMapCountryPageProjection(data)
    : getTruthMapCountryPageProjectionForGeo(code);
  if (!truthMapProjection) return { title: "Country not found", robots: { index: false, follow: false } };
  if (!data) {
    return {
      title: `Cannabis law in ${truthMapProjection.properties.displayName} — ${truthMapProjection.properties.legalTruthColor}`,
      description: truthMapProjection.properties.legalEvidenceSummary,
      robots: { index: false, follow: true },
      alternates: { canonical: `/c/${code.toLowerCase()}` }
    };
  }
  const heading = getCountrySeoTitle(data, "en");
  return {
    title: heading,
    description: truthMapProjection.properties.legalEvidenceSummary,
    alternates: {
      canonical: `/c/${data.code}`,
      languages: buildSeoLanguageAlternates(data.code)
    },
    openGraph: {
      title: heading,
      description: truthMapProjection.properties.legalEvidenceSummary,
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
  const truthMapProjection = data
    ? getTruthMapCountryPageProjection(data)
    : getTruthMapCountryPageProjectionForGeo(code);
  if (!truthMapProjection) notFound();
  if (!data) return <TruthMapTerritorySeoPage code={code.toLowerCase()} projection={truthMapProjection} />;
  ensureCountryPageHash(data);
  return <CountrySeoPage data={data} locale="en" query={query} truthMapProjection={truthMapProjection} />;
}
