"use client";

import dynamic from "next/dynamic";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import type { LegalCountryCollection } from "@/new-map/map.types";
import type { CountryCardEntry } from "@/new-map/components/CountryCard";

type Props = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
  cardIndex: Record<string, CountryCardEntry>;
  usStates: LegalCountryCollection;
};

const MapRoot = dynamic(() => import("@/new-map/MapRoot"), { ssr: false });

export default function NewMapClientEntry(props: Props) {
  return <MapRoot {...props} />;
}
