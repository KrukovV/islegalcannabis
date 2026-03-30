export type GeoSource = "manual" | "gps" | "ip" | "none";

export type GeoCandidate = {
  geo?: string | null;
  source: GeoSource;
};

export function resolveGeo(input: {
  manual?: GeoCandidate | null;
  gps?: GeoCandidate | null;
  ip?: GeoCandidate | null;
}): GeoCandidate {
  const pick = [input.manual, input.gps, input.ip].find(
    (entry) => entry?.geo && String(entry.geo).trim() !== "" && String(entry.geo) !== "-"
  );
  if (!pick) return { geo: null, source: "none" };
  return { geo: String(pick.geo).toUpperCase(), source: pick.source };
}

