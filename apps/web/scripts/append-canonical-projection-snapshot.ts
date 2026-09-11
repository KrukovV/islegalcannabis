import fs from "node:fs";
import path from "node:path";
import { buildEvidencePassportCollection } from "../src/truth-map/evidencePassport";
import {
  canonicalProjectionLedgerPath,
  createCanonicalProjectionSnapshot,
  validateCanonicalProjectionLedger,
  type CanonicalProjectionLedger
} from "../src/truth-map/canonicalProjectionLedger";

const ledgerPath = canonicalProjectionLedgerPath();
const current = createCanonicalProjectionSnapshot(buildEvidencePassportCollection().passports);
let ledger: CanonicalProjectionLedger = { schemaVersion: 1, localOnly: true, appendOnly: true, snapshots: [] };
if (fs.existsSync(ledgerPath)) ledger = validateCanonicalProjectionLedger(JSON.parse(fs.readFileSync(ledgerPath, "utf8")));
const existing = ledger.snapshots.find((snapshot) => snapshot.versionId === current.versionId);
if (existing) {
  if (existing.snapshotSha256 !== current.snapshotSha256) throw new Error(`CANONICAL_PROJECTION_VERSION_REWRITE_FORBIDDEN=${current.versionId}`);
  process.stdout.write(`CANONICAL_PROJECTION_BASELINE_UNCHANGED=${current.versionId}\n`);
  process.exit(0);
}
const next = validateCanonicalProjectionLedger({ ...ledger, snapshots: [...ledger.snapshots, current] });
fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
fs.writeFileSync(ledgerPath, `${JSON.stringify(next, null, 2)}\n`, { flag: "w" });
process.stdout.write(`CANONICAL_PROJECTION_SNAPSHOT_APPENDED=${current.versionId} GEO=307\n`);
