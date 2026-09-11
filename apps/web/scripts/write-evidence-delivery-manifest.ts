import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "../src/lib/ssotDiff/ssotSnapshotStore";
import { buildEvidenceDeliveryManifest } from "../src/truth-map/evidenceDeliveryManifest";

const repoRoot = findRepoRoot(process.cwd());
const manifestPath = path.join(repoRoot, "data", "b2b_evidence", "evidence_delivery_manifest.json");
const manifest = buildEvidenceDeliveryManifest();
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
const previous = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : null;
if (previous !== serialized) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, serialized, "utf8");
  process.stdout.write(`EVIDENCE_DELIVERY_MANIFEST_WRITTEN=${manifestPath}\n`);
} else {
  process.stdout.write(`EVIDENCE_DELIVERY_MANIFEST_UNCHANGED=${manifestPath}\n`);
}
process.stdout.write(`EVIDENCE_DELIVERY_MANIFEST_GEOS=${manifest.geoCount}\n`);
process.stdout.write(`EVIDENCE_DELIVERY_MANIFEST_SHA256=${manifest.manifestSha256}\n`);
