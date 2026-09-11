import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import { buildEvidenceDeliveryManifest } from "./evidenceDeliveryManifest";

describe("Evidence delivery manifest", () => {
  it("accounts for deterministic JSON, embed and print/PDF delivery for all 307 canonical GEO", () => {
    const first = buildEvidenceDeliveryManifest();
    const second = buildEvidenceDeliveryManifest();
    expect(first).toEqual(second);
    expect(first.geoCount).toBe(307);
    expect(first.entries).toHaveLength(307);
    expect(first.entries.every((entry) => (
      entry.canonicalProjectionVersion === first.canonicalProjectionVersion
      && /^[a-f0-9]{64}$/.test(entry.artifacts.json.sha256)
      && /^[a-f0-9]{64}$/.test(entry.artifacts.embed.sha256)
      && /^[a-f0-9]{64}$/.test(entry.artifacts.printPdf.sha256)
      && entry.artifacts.printPdf.delivery === "PRINT_HTML_SAVE_AS_PDF"
    ))).toBe(true);
    expect(new Set(first.entries.map((entry) => entry.geo)).size).toBe(307);
    expect(first.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    const committed = JSON.parse(fs.readFileSync(
      path.join(findRepoRoot(process.cwd()), "data", "b2b_evidence", "evidence_delivery_manifest.json"),
      "utf8"
    ));
    expect(committed).toEqual(first);
  });
});
