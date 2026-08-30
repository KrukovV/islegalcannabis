"use client";

import type maplibregl from "maplibre-gl";
import { useSocialMapLayer } from "@/new-map/social/SocialLayer";
import type { SocialRuntimeConfig } from "@/social/runtimeConfig";

type Props = {
  config: SocialRuntimeConfig;
  map: maplibregl.Map | null;
  mapReady: boolean;
};

/** Audit-only adapter. It is dynamically loaded only by the local Truth Map. */
export default function TruthMapAuditSocialLayer({ config, map, mapReady }: Props) {
  useSocialMapLayer(map, mapReady, config);
  return null;
}
