import type { Metadata } from "next";
import NewMapClientEntry from "./NewMapClientEntry";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { INLINE_COUNTRIES_URL } from "@/new-map/staticCountries";
import { getNewMapRuntimeIdentity } from "./runtimeConfig";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

function readBoundedNumber(value: string | string[] | undefined, min: number, max: number) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export default async function NewMapPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const runtimeIdentity = getNewMapRuntimeIdentity();
  const visibleStamp = formatVisibleRuntimeStamp(runtimeIdentity);
  const countriesUrl = INLINE_COUNTRIES_URL;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialGeoCode =
    (typeof resolvedSearchParams?.geo === "string" ? resolvedSearchParams.geo : null) ||
    (typeof resolvedSearchParams?.code === "string" ? resolvedSearchParams.code : null);
  const lat = readBoundedNumber(resolvedSearchParams?.lat, -90, 90);
  const lng = readBoundedNumber(resolvedSearchParams?.lng, -180, 180);
  const zoom = readBoundedNumber(resolvedSearchParams?.zoom, 0, 14);
  const initialMapView = lat === null || lng === null || zoom === null ? null : { lat, lng, zoom };
  return (
    <NewMapClientEntry
      countriesUrl={countriesUrl}
      visibleStamp={visibleStamp}
      runtimeIdentity={runtimeIdentity}
      initialGeoCode={initialGeoCode}
      initialMapView={initialMapView}
    />
  );
}
