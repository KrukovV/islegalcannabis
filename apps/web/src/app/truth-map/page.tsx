import type { Metadata } from "next";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import TruthMapAuditRoot from "@/truth-map/TruthMapAuditRoot";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { getTruthMapRuntimeIdentity } from "./runtimeConfig";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Truth Map — Audit Preview", robots: { index: false, follow: false } };

function readBoundedNumber(value: string | string[] | undefined, min: number, max: number) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export default async function TruthMapPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const runtimeIdentity = getTruthMapRuntimeIdentity();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const lat = readBoundedNumber(resolvedSearchParams?.lat, -90, 90);
  const lng = readBoundedNumber(resolvedSearchParams?.lng, -180, 180);
  const zoom = readBoundedNumber(resolvedSearchParams?.zoom, 0, 15);
  const initialMapView = lat === null || lng === null || zoom === null ? null : { lat, lng, zoom };
  const socialPanelInitiallyOpen = resolvedSearchParams?.qa === "1";
  return <TruthMapAuditRoot countriesUrl="/api/truth-map/countries" usStatesUrl="/api/truth-map/us-states" visibleStamp={formatVisibleRuntimeStamp(runtimeIdentity)} runtimeIdentity={runtimeIdentity} initialMapView={initialMapView} socialConfig={getSocialRuntimeConfig()} socialPanelInitiallyOpen={socialPanelInitiallyOpen} />;
}
