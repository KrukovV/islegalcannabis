function haversineKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function nearestLegalBorder(current, candidates) {
  if (!current || !Array.isArray(candidates)) return null;
  const origin = { lat: current.lat, lon: current.lon };
  let best = null;
  for (const item of candidates) {
    if (!item || item.statusLevel !== "green") continue;
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
    const distanceKm = haversineKm(origin, { lat: item.lat, lon: item.lon });
    if (!best || distanceKm < best.distanceKm) {
      best = { id: item.id ?? item.jurisdictionKey ?? "UNKNOWN", distanceKm };
    }
  }
  return best;
}
