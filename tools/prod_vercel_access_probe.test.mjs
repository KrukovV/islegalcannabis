import test from "node:test";
import assert from "node:assert/strict";
import {
  hasVercelChallengeText,
  isChallengeEvidence,
  parseProbeArgs,
  secretHashPrefix,
  summarizeDecision
} from "./prod_vercel_access_probe.mjs";

test("access probe parses staged recovery CLI without enabling pass cycle", () => {
  const parsed = parseProbeArgs([
    "--base-url=https://www.islegal.info/new-map?qa=1",
    "--modes=method2-cookie,document-extra-headers",
    "--runs=1",
    "--cooldown-ms=90000",
    "--stop-on-challenge=1",
    "--write-storage-state=playwright/.auth/vercel-bypass.production.json"
  ], {});

  assert.equal(parsed.baseUrl, "https://www.islegal.info/new-map?qa=1");
  assert.deepEqual(parsed.modes, ["method2-cookie", "document-extra-headers"]);
  assert.equal(parsed.runs, 1);
  assert.equal(parsed.cooldownMs, 90000);
  assert.equal(parsed.stopOnChallenge, true);
  assert.equal(parsed.writeStorageState, "playwright/.auth/vercel-bypass.production.json");
});

test("access probe classifies Vercel checkpoint as stop condition", () => {
  assert.equal(hasVercelChallengeText("Vercel Security Checkpoint"), true);
  assert.equal(isChallengeEvidence({ status: 403, x_vercel_mitigated: "challenge" }), true);
  assert.equal(summarizeDecision([{ result: "STOP", challenge_count: 1 }]), "STOP_VERCEL_CHALLENGE_WINDOW");
});

test("access probe exposes only a secret hash prefix", () => {
  assert.match(secretHashPrefix("not-a-real-secret-value"), /^sha256:[a-f0-9]{12}$/);
});
