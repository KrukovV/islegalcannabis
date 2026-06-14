"use client";

import dynamic from "next/dynamic";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import type { CountryPageData } from "@/lib/countryPageStorage";
import type { SeoLocale } from "@/lib/seo/i18n";

type Props = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
  initialGeoCode?: string | null;
  seoCountryData?: CountryPageData | null;
  seoCountryIndex?: Record<string, CountryPageData>;
  locale?: SeoLocale;
};

const MapRoot = dynamic(() => import("@/new-map/MapRoot"), { ssr: false });

export default function NewMapClientEntry(props: Props) {
  const runtimeKey = [
    props.runtimeIdentity.buildId,
    props.runtimeIdentity.commit,
    props.runtimeIdentity.builtAt,
    props.runtimeIdentity.datasetHash,
    props.runtimeIdentity.finalSnapshotId,
    props.runtimeIdentity.snapshotBuiltAt
  ].join("|");

  return <MapRoot key={runtimeKey} {...props} />;
}
