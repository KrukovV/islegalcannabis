import fs from "node:fs";
import path from "node:path";

export const TRENDS_TIMEFRAME = "today 5-y";
export const TRENDS_KEYWORDS = [
  "is legal weed",
  "is legal cannabis",
  "legal weed"
];

export function writeTrendsMeta(outDir, meta) {
  const payload = {
    isReal: Boolean(meta?.isReal),
    source: meta?.source ?? "skipped",
    timeframe: meta?.timeframe ?? TRENDS_TIMEFRAME,
    keywords: Array.isArray(meta?.keywords) ? meta.keywords : TRENDS_KEYWORDS,
    generatedAt: meta?.generatedAt ?? new Date().toISOString(),
    retryAt: meta?.retryAt ?? null,
    rows: Number.isFinite(meta?.rows) ? meta.rows : 0,
    sha256: meta?.sha256 ?? {}
  };

  fs.mkdirSync(outDir, { recursive: true });
  const metaPath = path.join(outDir, "meta.json");
  fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2) + "\n");
  return metaPath;
}
