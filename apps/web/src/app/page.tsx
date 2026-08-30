import type { Metadata } from "next";
import { headers } from "next/headers";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import TruthMapRoot from "@/truth-map/TruthMapRoot";
import { getTruthMapRuntimeIdentity } from "./truth-map/runtimeConfig";
import LocalPublicMapRoot from "./_components/LocalPublicMapRoot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Cannabis Legality Map — Laws by Country and U.S. State",
  description: "Explore current cannabis legality by country and U.S. state, retained official legal evidence and verified regulated cannabis locations.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

function readBoundedNumber(value: string | string[] | undefined, min: number, max: number) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requestHeaders = await headers();
  const localAuditHost = isLocalAuditHost(requestHeaders.get("host"));
  const runtimeIdentity = getTruthMapRuntimeIdentity();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const lat = readBoundedNumber(resolvedSearchParams.lat, -90, 90);
  const lng = readBoundedNumber(resolvedSearchParams.lng, -180, 180);
  const zoom = readBoundedNumber(resolvedSearchParams.zoom, 0, 15);
  const geo = (typeof resolvedSearchParams.geo === "string" ? resolvedSearchParams.geo : null) ||
    (typeof resolvedSearchParams.code === "string" ? resolvedSearchParams.code : null);
  const initialGeoCode = geo && /^[A-Za-z0-9-]{2,12}$/.test(geo) ? geo.toUpperCase() : null;
  const initialMapView = lat === null || lng === null || zoom === null ? null : { lat, lng, zoom };

  const mapProps = {
    countriesUrl: "/api/public-map/countries",
    usStatesUrl: "/api/public-map/us-states",
    visibleStamp: formatVisibleRuntimeStamp(runtimeIdentity),
    runtimeIdentity,
    initialMapView,
    initialGeoCode,
  };

  if (localAuditHost) return <LocalPublicMapRoot {...mapProps} />;
  return <TruthMapRoot {...mapProps} presentation="public" showPublicMapNotice={false} />;
}
