import { FeatureFlag, type FeatureFlagMap, resolveFeatureFlags } from "@/config/featureFlags";

function readFlags(flags?: FeatureFlagMap): FeatureFlagMap {
  return flags ?? resolveFeatureFlags();
}

export function checkPremium(flags?: FeatureFlagMap): boolean {
  return readFlags(flags)[FeatureFlag.PREMIUM].enabled;
}

export function checkMapEnabled(flags?: FeatureFlagMap): boolean {
  return readFlags(flags)[FeatureFlag.MAP_ENABLED].enabled;
}

export function checkTripMode(flags?: FeatureFlagMap): boolean {
  return readFlags(flags)[FeatureFlag.TRIP_MODE].enabled;
}

export function checkNearLegalEnabled(flags?: FeatureFlagMap): boolean {
  const current = readFlags(flags);
  return (
    current[FeatureFlag.PREMIUM].enabled &&
    current[FeatureFlag.MAP_ENABLED].enabled &&
    current[FeatureFlag.NEAR_LEGAL].enabled
  );
}
