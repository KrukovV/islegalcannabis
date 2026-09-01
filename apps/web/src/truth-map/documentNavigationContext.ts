export type TruthMapCamera = {
  lat: number;
  lng: number;
  zoom: number;
};

export type TruthMapDocumentNavigationContext = {
  targetPath: string;
  geo: string;
  camera: TruthMapCamera;
  createdAt: number;
};

const STORAGE_KEY = "truth-map-document-navigation-v1";
const MAX_AGE_MS = 5 * 60 * 1000;
const GEO_RE = /^[A-Z0-9-]{2,12}$/;
const DOCUMENT_PATH_RE = /^\/c\/[a-z0-9-]+$/i;
let consumedNavigation: TruthMapDocumentNavigationContext | null | undefined;

function finiteWithin(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function canonicalDocumentPath(value: string, origin = "https://www.islegal.info") {
  try {
    const path = new URL(value, origin).pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "").toLowerCase() || "/";
    return DOCUMENT_PATH_RE.test(path) ? path : null;
  } catch {
    return null;
  }
}

export function normalizeTruthMapDocumentNavigationContext(value: unknown, currentPath: string, now = Date.now()): TruthMapDocumentNavigationContext | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TruthMapDocumentNavigationContext>;
  const targetPath = typeof candidate.targetPath === "string" ? canonicalDocumentPath(candidate.targetPath) : null;
  const resolvedCurrentPath = canonicalDocumentPath(currentPath);
  const geo = typeof candidate.geo === "string" ? candidate.geo.trim().toUpperCase() : "";
  const camera = candidate.camera;
  const createdAt = Number(candidate.createdAt);
  if (!targetPath || !resolvedCurrentPath || targetPath !== resolvedCurrentPath || !GEO_RE.test(geo)) return null;
  if (!finiteWithin(createdAt, 0, now) || now - createdAt > MAX_AGE_MS) return null;
  if (!camera || !finiteWithin(camera.lat, -90, 90) || !finiteWithin(camera.lng, -180, 180) || !finiteWithin(camera.zoom, 0, 15)) return null;
  return {
    targetPath,
    geo,
    camera: { lat: camera.lat, lng: camera.lng, zoom: camera.zoom },
    createdAt
  };
}

export function storeTruthMapDocumentNavigation(targetHref: string, geo: string, camera: TruthMapCamera) {
  if (typeof window === "undefined") return false;
  const targetPath = canonicalDocumentPath(targetHref, window.location.origin);
  const normalizedGeo = String(geo || "").trim().toUpperCase();
  const candidate = {
    targetPath,
    geo: normalizedGeo,
    camera,
    createdAt: Date.now()
  };
  const context = normalizeTruthMapDocumentNavigationContext(candidate, targetPath || "", candidate.createdAt);
  if (!context) return false;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    return true;
  } catch {
    return false;
  }
}

/** Consume only a matching, bounded, short-lived map context for this document. */
export function takeTruthMapDocumentNavigation() {
  if (typeof window === "undefined") return null;
  // React development Strict Mode can mount a client root twice. One document
  // navigation must remain available to both mounts, but only for this page.
  if (consumedNavigation !== undefined) return consumedNavigation;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    consumedNavigation = raw
      ? normalizeTruthMapDocumentNavigationContext(JSON.parse(raw), window.location.pathname)
      : null;
    return consumedNavigation;
  } catch {
    consumedNavigation = null;
    return consumedNavigation;
  }
}
