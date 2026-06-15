import test from "node:test";
import assert from "node:assert/strict";
import { secretLeakGuard } from "./prod_vercel_access_probe.mjs";
import { redactSensitive } from "./lib/vercel-bypass.mjs";

test("secret leak guard fails raw secret and passes redacted payloads", () => {
  const secret = "not-a-real-secret-value";
  assert.equal(secretLeakGuard({ value: secret }, secret), "FAIL");
  assert.equal(secretLeakGuard({ value: redactSensitive(secret, { secret }) }, secret), "PASS");
});

test("redaction removes query, cookie, and raw secret appearances", () => {
  const secret = "not-a-real-secret-value";
  const text = `https://x.test/?x-vercel-protection-bypass=${secret}; __vercel_bypass=${secret}`;
  const redacted = redactSensitive(text, { secret });
  assert.equal(redacted.includes(secret), false);
  assert.match(redacted, /\[redacted\]/);
});
