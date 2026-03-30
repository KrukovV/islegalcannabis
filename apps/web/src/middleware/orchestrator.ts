import { type GeoCandidate, resolveGeo } from "./geo";
import { validateISO, validateState } from "./routeValidate";
import { FeatureFlag, resolveFeatureFlags, type FeatureFlagContext, type FeatureFlagMap } from "@/config/featureFlags";

type RouteInput = {
  iso?: string | null;
  state?: string | null;
};

type OrchestratorContext = FeatureFlagContext & {
  manual?: GeoCandidate | null;
  gps?: GeoCandidate | null;
  ip?: GeoCandidate | null;
  route?: RouteInput | null;
};

type GateState = {
  canMap: boolean;
  canTripMode: boolean;
  canNearLegal: boolean;
  canWorldOverlay: boolean;
  canUsStatesOverlay: boolean;
};

type RouteState = {
  ok: boolean;
  reason_code: "OK" | "INVALID_ISO" | "INVALID_STATE";
  status: 200 | 404;
};

export type MiddlewareResult = {
  geo: GeoCandidate;
  flags: FeatureFlagMap;
  route: RouteState;
  gates: GateState;
  errors: string[];
};

function buildRouteState(route: RouteInput | null | undefined): RouteState {
  if (!route) {
    return { ok: true, reason_code: "OK", status: 200 };
  }
  if (route.iso) {
    const check = validateISO(route.iso);
    if (!check.ok) {
      return { ok: false, reason_code: check.reason_code, status: 404 };
    }
  }
  if (route.state) {
    const check = validateState(route.state);
    if (!check.ok) {
      return { ok: false, reason_code: check.reason_code, status: 404 };
    }
  }
  return { ok: true, reason_code: "OK", status: 200 };
}

function buildGates(flags: FeatureFlagMap): GateState {
  const premium = flags[FeatureFlag.PREMIUM].enabled;
  const mapEnabled = flags[FeatureFlag.MAP_ENABLED].enabled;
  const worldOverlay = premium && mapEnabled && flags[FeatureFlag.WORLD_OVERLAY].enabled;
  const usStatesOverlay = worldOverlay && flags[FeatureFlag.US_STATES_OVERLAY].enabled;

  return {
    canMap: mapEnabled,
    canTripMode: flags[FeatureFlag.TRIP_MODE].enabled,
    canNearLegal: premium && mapEnabled && flags[FeatureFlag.NEAR_LEGAL].enabled,
    canWorldOverlay: worldOverlay,
    canUsStatesOverlay: usStatesOverlay
  };
}

export async function runMiddleware(ctx: OrchestratorContext): Promise<MiddlewareResult> {
  const geo = resolveGeo({ manual: ctx.manual, gps: ctx.gps, ip: ctx.ip });
  const flags = resolveFeatureFlags(ctx);
  const route = buildRouteState(ctx.route);
  const gates = buildGates(flags);
  const errors: string[] = [];
  if (!route.ok) {
    errors.push(`ROUTE_${route.reason_code}`);
  }
  return { geo, flags, route, gates, errors };
}
