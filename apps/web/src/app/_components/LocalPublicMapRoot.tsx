"use client";

import type { ComponentProps } from "react";
import MapGeoDock from "@/new-map/MapGeoDock";
import TruthMapRoot, { useTruthMapAuditContext } from "@/truth-map/TruthMapRoot";

type Props = Omit<
  ComponentProps<typeof TruthMapRoot>,
  "presentation" | "auditDock" | "auditMapLayer" | "auditPanel" | "interactiveOverlayLayerIds" | "publicLocalDock"
>;

function LocalPublicAiDock() {
  const { mapReady, cardIndex, selectedGeo, clearSelectedGeo, applyGeoToMap } = useTruthMapAuditContext();
  return (
    <MapGeoDock
      mapReady={mapReady}
      cardIndex={cardIndex}
      selectedGeo={selectedGeo}
      routeGeo={null}
      clearSelectedGeo={clearSelectedGeo}
      applyGeoToMap={applyGeoToMap}
      disableAiWarmup
    />
  );
}

/** Local-only public-map shell: retains the AI input without mounting Social or audit chrome. */
export default function LocalPublicMapRoot(props: Props) {
  return (
    <TruthMapRoot
      {...props}
      presentation="public"
      showPublicMapNotice
      publicLocalDock={<LocalPublicAiDock />}
    />
  );
}
