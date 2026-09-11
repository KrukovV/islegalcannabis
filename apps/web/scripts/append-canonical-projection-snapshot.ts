import fs from "node:fs";
import path from "node:path";
import { buildEvidencePassportCollection } from "../src/truth-map/evidencePassport";
import {
  canonicalProjectionLedgerPath,
  createCanonicalProjectionSnapshot,
  validateCanonicalProjectionLedger,
  type CanonicalProjectionLedger
} from "../src/truth-map/canonicalProjectionLedger";

const publishedAtArg = process.argv.find((argument) => argument.startsWith("--published-at="))?.slice("--published-at=".length)
  || (process.argv.includes("--published-at") ? process.argv[process.argv.indexOf("--published-at") + 1] : "");
const ledgerPath = canonicalProjectionLedgerPath();
const passports = buildEvidencePassportCollection("", { allowUnregisteredCurrentVersion: true }).passports;
const unrecordedCurrent = createCanonicalProjectionSnapshot(passports);
let ledger: CanonicalProjectionLedger = { schemaVersion: 1, localOnly: true, appendOnly: true, snapshots: [] };
if (fs.existsSync(ledgerPath)) ledger = validateCanonicalProjectionLedger(JSON.parse(fs.readFileSync(ledgerPath, "utf8")));
const existing = ledger.snapshots.find((snapshot) => snapshot.versionId === unrecordedCurrent.versionId);
if (existing) {
  const comparable = createCanonicalProjectionSnapshot(passports, existing.generatedAt);
  if (existing.snapshotSha256 !== comparable.snapshotSha256) throw new Error(`CANONICAL_PROJECTION_VERSION_REWRITE_FORBIDDEN=${existing.versionId}`);
  process.stdout.write(`CANONICAL_PROJECTION_BASELINE_UNCHANGED=${existing.versionId}\n`);
  process.exit(0);
}
if (!publishedAtArg || !Number.isFinite(Date.parse(publishedAtArg))) {
  throw new Error("CANONICAL_PROJECTION_NEW_VERSION_REQUIRES_REAL_PUBLISHED_AT");
}
const current = createCanonicalProjectionSnapshot(passports, new Date(publishedAtArg).toISOString());
const next = validateCanonicalProjectionLedger({ ...ledger, snapshots: [...ledger.snapshots, current] });
fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
fs.writeFileSync(ledgerPath, `${JSON.stringify(next, null, 2)}\n`, { flag: "w" });
process.stdout.write(`CANONICAL_PROJECTION_SNAPSHOT_APPENDED=${current.versionId} GEO=307\n`);
