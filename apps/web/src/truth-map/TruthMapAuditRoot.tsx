"use client";

import type { ComponentProps } from "react";
import MapGeoDock from "@/new-map/MapGeoDock";
import type { SocialRuntimeConfig } from "@/social/runtimeConfig";
import TruthMapAuditSocialLayer from "./TruthMapAuditSocialLayer";
import TruthMapRoot, { useTruthMapAuditContext } from "./TruthMapRoot";
import TruthMapSocialPanel from "./TruthMapSocialPanel";

const AUDIT_SOCIAL_INTERACTIVE_LAYER_IDS = [
  "social-map-activity-cells",
  "social-map-activity-counts",
] as const;

type Props = Omit<
  ComponentProps<typeof TruthMapRoot>,
  "presentation" | "interactiveOverlayLayerIds" | "auditMapLayer" | "auditDock" | "auditPanel"
> & {
  socialConfig: SocialRuntimeConfig;
  socialPanelInitiallyOpen?: boolean;
};

function AuditDock() {
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

function AuditMapLayer({ config }: { config: SocialRuntimeConfig }) {
  const { map, mapReady } = useTruthMapAuditContext();
  return <TruthMapAuditSocialLayer config={config} map={map} mapReady={mapReady} />;
}

function AuditPanel({ config, initiallyOpen }: { config: SocialRuntimeConfig; initiallyOpen: boolean }) {
  const { map, mapReady } = useTruthMapAuditContext();
  return <TruthMapSocialPanel config={config} map={map} mapReady={mapReady} initiallyOpen={initiallyOpen} />;
}

/** Local-only audit shell. Public `/` imports only the display core. */
export default function TruthMapAuditRoot({ socialConfig, socialPanelInitiallyOpen = false, ...props }: Props) {
  return (
    <TruthMapRoot
      {...props}
      presentation="audit"
      interactiveOverlayLayerIds={AUDIT_SOCIAL_INTERACTIVE_LAYER_IDS}
      auditDock={<AuditDock />}
      auditMapLayer={<AuditMapLayer config={socialConfig} />}
      auditPanel={<AuditPanel config={socialConfig} initiallyOpen={socialPanelInitiallyOpen} />}
    />
  );
}
