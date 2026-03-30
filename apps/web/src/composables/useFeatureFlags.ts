"use client";

import { useMemo } from "react";
import { FeatureFlag, resolveFeatureFlags, summarizeFeatureFlags, type FeatureFlagMap } from "@/config/featureFlags";
type RuntimeWindow = Window & { __runtimeFlags?: FeatureFlagMap };

export type FeatureFlagsView = {
  isPremium: boolean;
  canMap: boolean;
  canTripMode: boolean;
  canNearLegal: boolean;
  canWorldOverlay: boolean;
  canUsStatesOverlay: boolean;
  sourcesSummary: Record<string, number>;
};

export function useFeatureFlags(): FeatureFlagsView {
  return useMemo(() => {
    const runtimeFlags =
      typeof window !== "undefined" ? (window as RuntimeWindow).__runtimeFlags : undefined;
    const flags: FeatureFlagMap = runtimeFlags ?? resolveFeatureFlags();
    return {
      isPremium: flags[FeatureFlag.PREMIUM].enabled,
      canMap: flags[FeatureFlag.MAP_ENABLED].enabled,
      canTripMode: flags[FeatureFlag.TRIP_MODE].enabled,
      canNearLegal: flags[FeatureFlag.NEAR_LEGAL].enabled,
      canWorldOverlay: flags[FeatureFlag.WORLD_OVERLAY].enabled,
      canUsStatesOverlay: flags[FeatureFlag.US_STATES_OVERLAY].enabled,
      sourcesSummary: summarizeFeatureFlags(flags)
    };
  }, []);
}
