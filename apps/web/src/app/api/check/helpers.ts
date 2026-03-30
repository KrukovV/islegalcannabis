import { computeStatus, STATUS_BANNERS } from "@islegal/shared";
import fs from "node:fs";
import path from "node:path";

export function buildVerifyLinks(
  sources: Array<{ title: string; url: string }> | undefined,
  isoMeta?: { verify?: { isoObp?: string; wiki?: string } } | null
) {
  const links = Array.isArray(sources) ? [...sources] : [];
  if (isoMeta?.verify?.isoObp && isoMeta?.verify?.wiki) {
    links.push({ title: "ISO 3166-1", url: isoMeta.verify.isoObp });
    links.push({ title: "ISO 3166-1 alpha-2", url: isoMeta.verify.wiki });
  }
  return links;
}

export function buildNeedsReviewStatus() {
  return {
    level: "gray" as const,
    label: STATUS_BANNERS.needs_review.title,
    icon: "⚠️"
  };
}

function buildProvisionalStatus() {
  return {
    level: "yellow" as const,
    label: STATUS_BANNERS.provisional.title,
    icon: "⚠️"
  };
}

export function buildDisplayStatus(profile: { status: string }) {
  if (profile.status === "needs_review" || profile.status === "unknown") {
    return buildNeedsReviewStatus();
  }
  if (profile.status === "provisional") {
    return buildProvisionalStatus();
  }
  return computeStatus(profile as Parameters<typeof computeStatus>[0]);
}

export function normalizeRegionName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function geoConfidenceScore(source: string, normalized: string | null) {
  if (source === "manual") return 1.0;
  if (source === "gps") return 0.9;
  if (source === "ip") return 0.6;
  if (normalized === "high") return 0.9;
  if (normalized === "medium") return 0.7;
  if (normalized === "low") return 0.5;
  return 0.0;
}

export function isMachineVerifiedFresh(
  entry: Record<string, unknown> | null,
  ttlDays = 45
) {
  if (!entry) return false;
  const ts = entry.verified_at ?? entry.updated_at ?? entry.ts;
  if (!ts || typeof ts !== "string") return false;
  const parsed = Date.parse(ts);
  if (!Number.isFinite(parsed)) return false;
  const maxAge = ttlDays * 24 * 60 * 60 * 1000;
  return Date.now() - parsed <= maxAge;
}

export function loadSsotChangedIds() {
  const reportPath = path.join(process.cwd(), "Reports", "ssot-diff", "last_run.json");
  if (!fs.existsSync(reportPath)) return new Set<string>();
  try {
    const data = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (data?.status !== "changed") return new Set<string>();
    const ids = Array.isArray(data.changed_ids) ? data.changed_ids : [];
    return new Set(
      ids
        .map((id: unknown) => String(id || "").toUpperCase())
        .filter(Boolean)
    );
  } catch {
    return new Set<string>();
  }
}
