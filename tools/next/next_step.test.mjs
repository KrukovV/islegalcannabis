import assert from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, "tools", "next", "next_step.mjs");

function run(args, env = {}) {
  const result = spawnSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
  assert.strictEqual(result.status, 0, result.stderr || "non-zero exit");
  return result.stdout.trim();
}

function assertEmpty(output) {
  assert.strictEqual(output, "");
}

const coverageFile = path.join(ROOT, ".checkpoints", "coverage-test.json");
const coverageSeoFile = path.join(
  ROOT,
  ".checkpoints",
  "coverage-test-seo.json"
);
fs.writeFileSync(
  coverageFile,
  JSON.stringify({
    total: 249,
    reviewed_count: 0,
    needs_review_count: 0,
    provisional_count: 0,
    missing_count: 249
  })
);
fs.writeFileSync(
  coverageSeoFile,
  JSON.stringify({
    total: 249,
    reviewed_count: 244,
    needs_review_count: 0,
    provisional_count: 5,
    missing_count: 0
  })
);

const passData = run([
  "--ciStatus=PASS",
  `--coveragePath=${coverageFile}`
]);
assertEmpty(passData);

const passSeo = run([
  "--ciStatus=PASS",
  "--changedPaths=apps/web/src/app/is-cannabis-legal-in-[slug]/page.tsx",
  `--coveragePath=${coverageSeoFile}`
]);
assertEmpty(passSeo);

const reviewedFile = path.join(ROOT, ".checkpoints", "coverage-test-reviewed.json");
const failCoverageFile = path.join(ROOT, ".checkpoints", "coverage-test-fail.json");
fs.writeFileSync(
  reviewedFile,
  JSON.stringify({
    total: 249,
    reviewed_count: 249,
    needs_review_count: 0,
    provisional_count: 0,
    missing_count: 0
  })
);
fs.writeFileSync(
  failCoverageFile,
  JSON.stringify({
    total: 0,
    reviewed_count: 0,
    needs_review_count: 0,
    provisional_count: 0,
    missing_count: 0
  })
);
const reviewedCase = run([
  "--ciStatus=PASS",
  `--coveragePath=${reviewedFile}`
]);
assertEmpty(reviewedCase);

const needsReviewFile = path.join(ROOT, ".checkpoints", "coverage-test-needs.json");
fs.writeFileSync(
  needsReviewFile,
  JSON.stringify({
    total: 249,
    reviewed_count: 0,
    needs_review_count: 2,
    provisional_count: 0,
    missing_count: 0
  })
);
const needsReviewCase = run([
  "--ciStatus=PASS",
  `--coveragePath=${needsReviewFile}`
], { CODEX_TEST_REVIEWS: "0" });
assertEmpty(needsReviewCase);

const tmpLog = path.join(ROOT, ".checkpoints", "ci-test.log");
fs.writeFileSync(tmpLog, "root-cause");
const failCase = run([
  "--ciStatus=FAIL",
  `--ciLog=${tmpLog}`,
  `--coveragePath=${failCoverageFile}`
]);
assertEmpty(failCase);

fs.unlinkSync(tmpLog);
fs.unlinkSync(coverageFile);
fs.unlinkSync(coverageSeoFile);
fs.unlinkSync(reviewedFile);
fs.unlinkSync(failCoverageFile);
fs.unlinkSync(needsReviewFile);
console.log("next_step tests passed");
