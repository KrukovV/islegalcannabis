import type { Metadata } from "next";
import NewMapClientEntry from "./NewMapClientEntry";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { getStaticCountriesAsset } from "@/new-map/staticCountries";
import { getNewMapRuntimeIdentity } from "./runtimeConfig";

type NewMapPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

function normalizeGeoParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw || "").trim().toUpperCase();
  if (!/^[A-Z]{2}(?:-[A-Z0-9]{1,3})?$/.test(normalized)) return null;
  return normalized;
}

export default async function NewMapPage({ searchParams }: NewMapPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialGeoCode = normalizeGeoParam(resolvedSearchParams.geo);
  const runtimeIdentity = getNewMapRuntimeIdentity();
  const visibleStamp = formatVisibleRuntimeStamp(runtimeIdentity);
  const countriesUrl = getStaticCountriesAsset().url;
  return (
    <NewMapClientEntry
      countriesUrl={countriesUrl}
      visibleStamp={visibleStamp}
      runtimeIdentity={runtimeIdentity}
      initialGeoCode={initialGeoCode}
    />
  );
}
