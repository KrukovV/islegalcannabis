import type { Metadata } from "next";
import NewMapClientEntry from "./NewMapClientEntry";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { getStaticCountriesAsset } from "@/new-map/staticCountries";
import { getNewMapRuntimeIdentity } from "./runtimeConfig";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default async function NewMapPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const runtimeIdentity = getNewMapRuntimeIdentity();
  const visibleStamp = formatVisibleRuntimeStamp(runtimeIdentity);
  const countriesUrl = getStaticCountriesAsset().url;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialGeoCode =
    (typeof resolvedSearchParams?.geo === "string" ? resolvedSearchParams.geo : null) ||
    (typeof resolvedSearchParams?.code === "string" ? resolvedSearchParams.code : null);
  return (
    <NewMapClientEntry
      countriesUrl={countriesUrl}
      visibleStamp={visibleStamp}
      runtimeIdentity={runtimeIdentity}
      initialGeoCode={initialGeoCode}
    />
  );
}
