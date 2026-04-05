"use client";

import dynamic from "next/dynamic";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";

type Props = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
};

const MapRoot = dynamic(() => import("@/new-map/MapRoot"), { ssr: false });

export default function NewMapClientEntry(props: Props) {
  return <MapRoot {...props} />;
}
