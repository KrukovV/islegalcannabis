import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isCi } from "@/lib/env";
import { resolveRequestOrigin } from "@/lib/requestOrigin";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import { buildRuntimeIdentity, formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { getStatusSnapshotMeta } from "@/lib/mapData";
import { checkNearLegalEnabled, checkPremium } from "@/middleware/featureGate";
import { getBuildStamp } from "@/lib/buildStamp";
import { WikiTruthPageContent } from "./WikiTruthPageContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function WikiTruthPage() {
  const requestHeaders = await headers();
  if (!isLocalAuditHost(requestHeaders.get("host"))) {
    notFound();
  }
  const requestOrigin = resolveRequestOrigin(requestHeaders);
  const buildStamp = getBuildStamp();
  const runtimeIdentity = buildRuntimeIdentity({
    buildStamp,
    snapshot: getStatusSnapshotMeta(),
    runtimeMode:
      process.env.NODE_ENV === "production" ? "production" : "development",
    expectedOrigin: requestOrigin,
    devMode: !isCi() && process.env.NODE_ENV !== "production",
    mapEnabled: false,
    premiumMode: checkPremium() ? "PAID" : "FREE",
    nearbyMode: checkNearLegalEnabled() ? "RUN" : "SKIP",
    mapTiles: "OFFLINE",
    dataSource: "SSOT",
    mapRenderer: "none",
    mapRuntime: "removed",
  });
  const visibleRuntimeStamp = formatVisibleRuntimeStamp(runtimeIdentity);
  return (
    <WikiTruthPageContent
      runtimeIdentity={runtimeIdentity}
      visibleRuntimeStamp={visibleRuntimeStamp}
    />
  );
}
