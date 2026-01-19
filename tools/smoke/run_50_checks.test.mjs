import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildCases } from "./run_50_checks.mjs";

test("buildCases includes RU, TH, US-CA in the first 10 checks", () => {
  const top25Path = path.join(
    process.cwd(),
    "packages",
    "shared",
    "src",
    "top25.json"
  );
  const top25 = JSON.parse(fs.readFileSync(top25Path, "utf8"));
  const cases = buildCases(top25, "1");
  const top10 = cases.slice(0, 10).map((entry) => {
    const country = String(entry.country || "").toUpperCase();
    const region = entry.region ? String(entry.region).toUpperCase() : "";
    return `${country}${region ? `-${region}` : ""}`;
  });
  assert.ok(top10.includes("RU"));
  assert.ok(top10.includes("TH"));
  assert.ok(top10.includes("US-CA"));
});
