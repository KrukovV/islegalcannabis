import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { derivePrimaryLawBlockers } from "./build_wiki_truth_307_primary_law_blockers.mjs";
import { evaluatePrimaryLaw } from "./build_wiki_truth_307_acceptance_audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

test("primary-law blocker report mirrors every unresolved canonical acceptance row", () => {
  const report = readJson("data/reviews/wiki-truth-307-truth-audit-report.json");
  const matrix = readJson("data/reviews/wiki-truth-cannabis-law-matrix-307.json");
  const blockers = derivePrimaryLawBlockers(report, matrix, "2026-08-21T00:00:00.000Z");
  const matrixByGeo = new Map(matrix.rows.map((row) => [row.geo, row]));
  const expected = report.rows
    .filter((reportRow) => evaluatePrimaryLaw(reportRow, matrixByGeo.get(reportRow.geo), null).status !== "PROVEN")
    .map((reportRow) => reportRow.geo)
    .sort();

  assert.ok(blockers.length > 0, "open primary-law acceptance must be represented, not silently rendered as zero blockers");
  assert.deepEqual(
    blockers.map((blocker) => blocker.geo),
    expected,
  );
  for (const blocker of blockers) {
    assert.match(blocker.status, /^PRIMARY_LAW_/);
    assert.equal(blocker.nonMutationDecision.includes("SSOT"), true);
    assert.equal(blocker.knownPrimaryLawBoundary.status.length > 0, true);
  }
});
