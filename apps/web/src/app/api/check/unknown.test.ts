import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { STATUS_BANNERS } from "@islegal/shared";
import { GET } from "./route";

function listLawIds(root: string) {
  const dirs = [
    path.join(root, "data", "laws", "world"),
    path.join(root, "data", "laws", "eu")
  ];
  const ids = new Set<string>();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      ids.add(path.basename(name, ".json").toUpperCase());
    }
  }
  return ids;
}

function findMissingIso(root: string) {
  const isoPath = path.join(root, "data", "iso3166", "iso3166-1.json");
  if (!fs.existsSync(isoPath)) return null;
  const payload = JSON.parse(fs.readFileSync(isoPath, "utf8")) as {
    entries?: Array<{ alpha2?: string }>;
  };
  const ids = listLawIds(root);
  const entries = payload.entries ?? [];
  for (const entry of entries) {
    const alpha2 = entry.alpha2;
    if (alpha2 && !ids.has(alpha2.toUpperCase())) return alpha2.toUpperCase();
  }
  return null;
}

describe("GET /api/check verification status", () => {
  it("returns unknown response for ISO country without profile", async () => {
    const root = path.resolve(__dirname, "../../../../../..");
    const missing = findMissingIso(root);
    if (!missing) return;
    const req = new Request(`http://localhost/api/check?country=${missing}`);
    const res = await GET(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status.level).toBe("gray");
    expect(json.status.label).toBe(STATUS_BANNERS.needs_review.title);
    expect(json.profile).toBeNull();
  });
});
