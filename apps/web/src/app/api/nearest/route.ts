import { getLawProfile, normalizeKey } from "@/lib/lawStore";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { findNearestAllowed } from "@/lib/geo/nearestAllowed";
import fs from "node:fs";
import path from "node:path";
export const runtime = "nodejs";

let isoNameMap: Map<string, string> | null = null;
let stateNameMap: Map<string, string> | null = null;

function resolveDataPath(...parts: string[]) {
  const roots = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "..", "..")
  ];
  for (const root of roots) {
    const candidate = path.join(root, ...parts);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(process.cwd(), ...parts);
}

function loadIsoNameMap() {
  if (isoNameMap) return isoNameMap;
  const isoPath = resolveDataPath("data", "iso3166", "iso3166-1.json");
  const map = new Map<string, string>();
  if (fs.existsSync(isoPath)) {
    const payload = JSON.parse(fs.readFileSync(isoPath, "utf8"));
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    for (const entry of entries) {
      const alpha2 = entry?.alpha2 || entry?.id;
      const name = entry?.name;
      if (alpha2 && name) {
        map.set(String(alpha2).toUpperCase(), String(name));
      }
    }
  }
  isoNameMap = map;
  return map;
}

function flagFromCountry(country: string) {
  if (!country || country.length !== 2) return "";
  return String.fromCodePoint(
    ...country
      .toUpperCase()
      .split("")
      .map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)
  );
}

function splitId(id: string) {
  const parts = id.split("-");
  const country = (parts[0] || "").toUpperCase();
  const region = parts[1] ? parts[1].toUpperCase() : "";
  return { country, region };
}

function loadStateNameMap() {
  if (stateNameMap) return stateNameMap;
  const map = new Map<string, string>();
  const statePath = resolveDataPath("data", "geo", "us_state_centroids.json");
  if (fs.existsSync(statePath)) {
    const payload = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const items = payload?.items ?? {};
    Object.entries(items).forEach(([key, value]) => {
      const name = (value as { name?: string })?.name;
      if (name) {
        const normalizedKey = String(key).replace(/^US-/, "").toUpperCase();
        map.set(normalizedKey, String(name));
        map.set(String(key).toUpperCase(), String(name));
      }
    });
  }
  stateNameMap = map;
  return map;
}

function nameForId(id: string) {
  const { country, region } = splitId(id);
  const map = loadIsoNameMap();
  const countryName = map.get(country) ?? "Unknown";
  if (region && country === "US") {
    const items = loadStateNameMap();
    const regionKey = region.toUpperCase();
    let stateName = items.get(regionKey);
    if (!stateName && regionKey.length === 2) {
      stateName = items.get(`US-${regionKey}`);
    }
    stateName = stateName ?? region;
    return `${countryName} / ${stateName}`;
  }
  if (region) {
    return `${countryName} / ${region}`;
  }
  return countryName;
}

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") ?? "";
  const region = searchParams.get("region") ?? undefined;

  if (!country.trim()) {
    return errorResponse(
      requestId,
      400,
      "MISSING_COUNTRY",
      "Missing country.",
      "Provide country (and region for US)."
    );
  }

  const key = normalizeKey({ country, region });
  if (!key) {
    return errorResponse(
      requestId,
      400,
      "INVALID_JURISDICTION",
      "Invalid jurisdiction.",
      "Provide a valid country and region."
    );
  }

  const profile = getLawProfile({ country, region });
  if (!profile) {
    return errorResponse(
      requestId,
      404,
      "NOT_FOUND",
      "Jurisdiction not found.",
      "Try another country or region."
    );
  }

  const result = findNearestAllowed(profile);

  const withMeta = (item: { id: string; status: string; summary: string }) => {
    const { country } = splitId(item.id);
    return {
      ...item,
      flag: flagFromCountry(country),
      name: nameForId(item.id)
    };
  };

  return okResponse(requestId, {
    from: withMeta(result.current),
    nearest: result.nearest.map(withMeta)
  });
}
