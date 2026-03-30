import { ALL_GEO } from "@/lib/geo/allGeo";

const GEO_SET = new Set(ALL_GEO.map((geo) => String(geo).toUpperCase()));
const ISO_SET = new Set(Array.from(GEO_SET).filter((geo) => /^[A-Z]{2}$/.test(geo)));
const US_STATE_SET = new Set(Array.from(GEO_SET).filter((geo) => /^US-[A-Z]{2}$/.test(geo)));

export type RouteValidation = {
  ok: boolean;
  reason_code: "OK" | "INVALID_ISO" | "INVALID_STATE";
};

export function validateISO(iso: string | null | undefined): RouteValidation {
  const key = String(iso || "").toUpperCase();
  if (ISO_SET.has(key)) return { ok: true, reason_code: "OK" };
  return { ok: false, reason_code: "INVALID_ISO" };
}

export function validateState(stateCode: string | null | undefined): RouteValidation {
  const key = String(stateCode || "").toUpperCase();
  const full = key.startsWith("US-") ? key : `US-${key}`;
  if (US_STATE_SET.has(full)) return { ok: true, reason_code: "OK" };
  return { ok: false, reason_code: "INVALID_STATE" };
}

