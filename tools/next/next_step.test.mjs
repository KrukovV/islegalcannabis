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

function assertSingleNext(output) {
  const lines = output.split("\n");
  assert.strictEqual(lines.length, 1);
  assert.ok(lines[0].startsWith("Next: 1) "));
  assert.ok(!/^\\s*1\\./m.test(output));
  assert.ok(!lines.join("\n").includes("Next 2"));
}

function assertNoInfra(output) {
  const lower = output.toLowerCase();
  const banned = [
    "infra",
    "refactor pipeline",
    "setup",
    "installation",
    "option",
    "вариант",
    "можно",
    "либо",
    "?"
  ];
  for (const word of banned) {
    assert.ok(!lower.includes(word));
  }
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
assertSingleNext(passData);
assert.ok(passData.includes("provisional ISO countries"));
assertNoInfra(passData);

const passSeo = run([
  "--ciStatus=PASS",
  "--changedPaths=apps/web/src/app/is-cannabis-legal-in-[slug]/page.tsx",
  `--coveragePath=${coverageSeoFile}`
]);
assertSingleNext(passSeo);
assert.ok(passSeo.includes("Promote next provisional"));
assertNoInfra(passSeo);

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
assertSingleNext(reviewedCase);
assert.ok(reviewedCase.includes("SEO pages"));
assertNoInfra(reviewedCase);

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
assertSingleNext(needsReviewCase);
assert.ok(needsReviewCase.includes("review note"));
assertNoInfra(needsReviewCase);

const tmpLog = path.join(ROOT, ".checkpoints", "ci-test.log");
fs.writeFileSync(tmpLog, "root-cause");
const failCase = run([
  "--ciStatus=FAIL",
  `--ciLog=${tmpLog}`,
  `--coveragePath=${failCoverageFile}`
]);
assertSingleNext(failCase);
assert.ok(failCase.includes("Fix root-cause"));
assertNoInfra(failCase);

fs.unlinkSync(tmpLog);
fs.unlinkSync(coverageFile);
fs.unlinkSync(coverageSeoFile);
fs.unlinkSync(reviewedFile);
fs.unlinkSync(failCoverageFile);
fs.unlinkSync(needsReviewFile);
console.log("next_step tests passed");
