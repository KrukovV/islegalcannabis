export const FeatureFlag = {
  PREMIUM: "PREMIUM",
  MAP_ENABLED: "MAP_ENABLED",
  TRIP_MODE: "TRIP_MODE",
  NEAR_LEGAL: "NEAR_LEGAL",
  WORLD_OVERLAY: "WORLD_OVERLAY",
  US_STATES_OVERLAY: "US_STATES_OVERLAY"
} as const;

export type FeatureFlagKey = (typeof FeatureFlag)[keyof typeof FeatureFlag];

export type FeatureFlagSource = "query" | "storage" | "env" | "default";

export type FeatureFlagState = {
  enabled: boolean;
  source: FeatureFlagSource;
  reason?: string;
};

export type FeatureFlagMap = Record<FeatureFlagKey, FeatureFlagState>;

export type FeatureFlagContext = {
  query?: Record<string, string | undefined | null>;
  storage?: Record<string, string | undefined | null>;
  env?: Record<string, string | undefined | null>;
};

const FLAG_CONFIG: Record<
  FeatureFlagKey,
  {
    query: string[];
    storage: string[];
    env: string[];
    defaultEnabled: boolean;
  }
> = {
  [FeatureFlag.PREMIUM]: {
    query: ["premium"],
    storage: ["premium"],
    env: ["NEXT_PUBLIC_PREMIUM", "PREMIUM", "PREMIUM_ENABLED"],
    defaultEnabled: false
  },
  [FeatureFlag.MAP_ENABLED]: {
    query: ["map", "map_enabled"],
    storage: ["map_enabled"],
    env: ["NEXT_PUBLIC_MAP_ENABLED", "MAP_ENABLED"],
    defaultEnabled: process.env.NODE_ENV !== "production"
  },
  [FeatureFlag.TRIP_MODE]: {
    query: ["trip", "trip_mode"],
    storage: ["trip_mode"],
    env: ["NEXT_PUBLIC_TRIP_MODE", "TRIP_MODE"],
    defaultEnabled: false
  },
  [FeatureFlag.NEAR_LEGAL]: {
    query: ["near_legal", "near"],
    storage: ["near_legal"],
    env: ["NEXT_PUBLIC_NEAR_LEGAL", "NEAR_LEGAL"],
    defaultEnabled: false
  },
  [FeatureFlag.WORLD_OVERLAY]: {
    query: ["world_overlay", "overlay_world"],
    storage: ["world_overlay"],
    env: ["NEXT_PUBLIC_WORLD_OVERLAY"],
    defaultEnabled: true
  },
  [FeatureFlag.US_STATES_OVERLAY]: {
    query: ["us_states_overlay", "overlay_states"],
    storage: ["us_states_overlay"],
    env: ["NEXT_PUBLIC_US_STATES_OVERLAY"],
    defaultEnabled: true
  }
};

function normalizeBool(input: string | undefined | null): boolean | null {
  if (input == null) return null;
  const value = String(input).trim().toLowerCase();
  if (value === "") return null;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return null;
}

function pickFromKeys(
  source: Record<string, string | undefined | null> | undefined,
  keys: string[]
): { key: string; value: string | undefined | null } | null {
  if (!source) return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) {
      return { key, value: source[key] };
    }
  }
  return null;
}

function resolveFlag(
  flag: FeatureFlagKey,
  ctx: FeatureFlagContext
): FeatureFlagState {
  const cfg = FLAG_CONFIG[flag];
  const orderedSources: Array<{
    name: FeatureFlagSource;
    source: Record<string, string | undefined | null> | undefined;
    keys: string[];
  }> = [
    { name: "query", source: ctx.query, keys: cfg.query },
    { name: "storage", source: ctx.storage, keys: cfg.storage },
    { name: "env", source: ctx.env, keys: cfg.env }
  ];

  for (const item of orderedSources) {
    const hit = pickFromKeys(item.source, item.keys);
    if (!hit) continue;
    const parsed = normalizeBool(hit.value);
    if (parsed == null) {
      return {
        enabled: cfg.defaultEnabled,
        source: "default",
        reason: `BAD_VALUE:${hit.key}`
      };
    }
    return { enabled: parsed, source: item.name };
  }

  return { enabled: cfg.defaultEnabled, source: "default" };
}

export function resolveFeatureFlags(ctx: FeatureFlagContext = {}): FeatureFlagMap {
  const env = ctx.env ?? process.env;
  const base: FeatureFlagMap = {
    [FeatureFlag.PREMIUM]: resolveFlag(FeatureFlag.PREMIUM, { ...ctx, env }),
    [FeatureFlag.MAP_ENABLED]: resolveFlag(FeatureFlag.MAP_ENABLED, { ...ctx, env }),
    [FeatureFlag.TRIP_MODE]: resolveFlag(FeatureFlag.TRIP_MODE, { ...ctx, env }),
    [FeatureFlag.NEAR_LEGAL]: resolveFlag(FeatureFlag.NEAR_LEGAL, { ...ctx, env }),
    [FeatureFlag.WORLD_OVERLAY]: resolveFlag(FeatureFlag.WORLD_OVERLAY, { ...ctx, env }),
    [FeatureFlag.US_STATES_OVERLAY]: resolveFlag(FeatureFlag.US_STATES_OVERLAY, { ...ctx, env })
  };

  if (!base[FeatureFlag.MAP_ENABLED].enabled) {
    base[FeatureFlag.WORLD_OVERLAY] = {
      enabled: false,
      source: "default",
      reason: "MAP_DISABLED"
    };
    base[FeatureFlag.US_STATES_OVERLAY] = {
      enabled: false,
      source: "default",
      reason: "MAP_DISABLED"
    };
  }
  if (!base[FeatureFlag.PREMIUM].enabled) {
    base[FeatureFlag.NEAR_LEGAL] = {
      enabled: false,
      source: "default",
      reason: "PREMIUM_REQUIRED"
    };
    base[FeatureFlag.WORLD_OVERLAY] = {
      enabled: false,
      source: "default",
      reason: "PREMIUM_REQUIRED"
    };
    base[FeatureFlag.US_STATES_OVERLAY] = {
      enabled: false,
      source: "default",
      reason: "PREMIUM_REQUIRED"
    };
  }
  if (!base[FeatureFlag.WORLD_OVERLAY].enabled) {
    base[FeatureFlag.US_STATES_OVERLAY] = {
      enabled: false,
      source: "default",
      reason: "WORLD_OVERLAY_REQUIRED"
    };
  }

  return base;
}

export function summarizeFeatureFlags(flags: FeatureFlagMap): Record<string, number> {
  const values = Object.values(flags);
  const summary: Record<string, number> = {
    FLAGS_TOTAL: values.length,
    FLAGS_ENABLED_TOTAL: values.filter((value) => value.enabled).length,
    FLAGS_SOURCE_query: 0,
    FLAGS_SOURCE_storage: 0,
    FLAGS_SOURCE_env: 0,
    FLAGS_SOURCE_default: 0
  };
  for (const value of values) {
    const key = `FLAGS_SOURCE_${value.source}`;
    summary[key] = (summary[key] || 0) + 1;
  }
  return summary;
}

export type FeatureFlags = {
  premiumEnabled: boolean;
  mapEnabled: boolean;
  tripModeEnabled: boolean;
  whereIsNearLegalEnabled: boolean;
  worldOverlayEnabled: boolean;
  usStatesOverlayEnabled: boolean;
};

export function getFeatureFlags(): FeatureFlags {
  const flags = resolveFeatureFlags();
  return {
    premiumEnabled: flags[FeatureFlag.PREMIUM].enabled,
    mapEnabled: flags[FeatureFlag.MAP_ENABLED].enabled,
    tripModeEnabled: flags[FeatureFlag.TRIP_MODE].enabled,
    whereIsNearLegalEnabled: flags[FeatureFlag.NEAR_LEGAL].enabled,
    worldOverlayEnabled: flags[FeatureFlag.WORLD_OVERLAY].enabled,
    usStatesOverlayEnabled: flags[FeatureFlag.US_STATES_OVERLAY].enabled
  };
}
