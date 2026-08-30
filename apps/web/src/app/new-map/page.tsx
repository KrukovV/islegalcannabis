import type { Metadata } from "next";
import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
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

function canonicalPublicMapTarget(searchParams: Record<string, string | string[] | undefined>) {
  const target = new URLSearchParams();
  const geo = (typeof searchParams.geo === "string" ? searchParams.geo : null) ||
    (typeof searchParams.code === "string" ? searchParams.code : null);
  if (geo && /^[A-Za-z0-9-]{2,12}$/.test(geo)) target.set("geo", geo.toUpperCase());
  const lat = readBoundedNumber(searchParams.lat, -90, 90);
  const lng = readBoundedNumber(searchParams.lng, -180, 180);
  const zoom = readBoundedNumber(searchParams.zoom, 0, 15);
  if (lat !== null && lng !== null && zoom !== null) {
    target.set("lat", String(lat));
    target.set("lng", String(lng));
    target.set("zoom", String(zoom));
  }
  const query = target.toString();
  return query ? `/?${query}` : "/";
}

export default async function NewMapPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requestHeaders = await headers();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  if (!isLocalAuditHost(requestHeaders.get("host"))) {
    permanentRedirect(canonicalPublicMapTarget(resolvedSearchParams));
  }
  const runtimeIdentity = getNewMapRuntimeIdentity();
  const visibleStamp = formatVisibleRuntimeStamp(runtimeIdentity);
  const countriesUrl = INLINE_COUNTRIES_URL;
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
