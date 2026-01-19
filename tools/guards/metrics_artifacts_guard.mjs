import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: metrics artifacts guard failed: ${message}`);
  process.exit(1);
}

const checkedPath = path.join(
  process.cwd(),
  "Reports",
  "checked",
  "last_checked.json"
);
if (!fs.existsSync(checkedPath)) {
  fail("checked artifact missing");
}
let checkedPayload;
try {
  checkedPayload = JSON.parse(fs.readFileSync(checkedPath, "utf8"));
} catch {
  fail("checked artifact invalid JSON");
}
if (!Array.isArray(checkedPayload)) {
  fail("checked artifact must be an array");
}
const expectedChecked = Number(process.env.CHECKED_EXPECTED ?? 0);
if (expectedChecked > 0 && checkedPayload.length < expectedChecked) {
  fail(
    `checked artifact length=${checkedPayload.length} expected ${expectedChecked}`
  );
}

const coveragePath = path.join(
  process.cwd(),
  "Reports",
  "coverage",
  "last_coverage.json"
);
if (!fs.existsSync(coveragePath)) {
  fail("coverage artifact missing");
}
let coveragePayload;
try {
  coveragePayload = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
} catch {
  fail("coverage artifact invalid JSON");
}
if (!Number.isFinite(coveragePayload?.covered)) {
  fail("coverage artifact missing covered");
}
if (!Number.isFinite(coveragePayload?.missing)) {
  fail("coverage artifact missing missing");
}
if (!Number.isFinite(coveragePayload?.delta)) {
  fail("coverage artifact missing delta");
}

const isoBatchPath = path.join(process.cwd(), "Reports", "iso-last-batch.json");
if (!fs.existsSync(isoBatchPath)) {
  fail("iso batch artifact missing");
}
let isoPayload;
try {
  isoPayload = JSON.parse(fs.readFileSync(isoBatchPath, "utf8"));
} catch {
  fail("iso batch artifact invalid JSON");
}
if (!Number.isFinite(isoPayload?.addedCount)) {
  fail("iso batch artifact missing addedCount");
}
if (!Array.isArray(isoPayload?.added)) {
  fail("iso batch artifact missing added list");
}
if (isoPayload.added.length !== isoPayload.addedCount) {
  fail("iso batch artifact count mismatch");
}
