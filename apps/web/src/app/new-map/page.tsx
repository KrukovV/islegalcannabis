import type { Metadata } from "next";
import NewMapClientEntry from "./NewMapClientEntry";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { getBuildStamp } from "@/lib/buildStamp";
import { getNewMapRuntimeIdentity } from "./runtimeConfig";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default function NewMapPage() {
  const runtimeIdentity = getNewMapRuntimeIdentity();
  const visibleStamp = formatVisibleRuntimeStamp(runtimeIdentity);
  const countriesUrl = `/api/new-map/countries?v=${encodeURIComponent(getBuildStamp().buildId)}`;
  return (
    <NewMapClientEntry
      countriesUrl={countriesUrl}
      visibleStamp={visibleStamp}
      runtimeIdentity={runtimeIdentity}
    />
  );
}
