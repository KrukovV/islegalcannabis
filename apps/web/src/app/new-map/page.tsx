import type { Metadata } from "next";
import NewMapClientEntry from "./NewMapClientEntry";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { getStaticCountriesAsset } from "@/new-map/staticCountries";
import { preloadNewMapRouteAssets } from "@/new-map/preloadRouteAssets";
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
  const countriesUrl = getStaticCountriesAsset().url;
  preloadNewMapRouteAssets(countriesUrl);
  return (
    <NewMapClientEntry
      countriesUrl={countriesUrl}
      visibleStamp={visibleStamp}
      runtimeIdentity={runtimeIdentity}
    />
  );
}
