"use client";

import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import type { CountryPageData } from "@/lib/countryPageStorage";
import type { SeoLocale } from "@/lib/seo/i18n";
import MapRoot from "@/new-map/MapRoot";

type Props = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
  initialGeoCode?: string | null;
  seoCountryData?: CountryPageData | null;
  seoCountryIndex?: Record<string, CountryPageData>;
  locale?: SeoLocale;
};

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
