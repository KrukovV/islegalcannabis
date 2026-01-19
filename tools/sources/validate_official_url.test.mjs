import assert from "node:assert/strict";
import { test } from "node:test";
import { validateOfficialUrl } from "./validate_official_url.mjs";

test("validate_official_url allows whitelisted or gov-like https", () => {
  const whitelist = { allowed: ["example.gov"] };
  assert.equal(
    validateOfficialUrl("https://example.gov/path", whitelist).ok,
    true
  );
  assert.equal(
    validateOfficialUrl("https://service.gov.uk", { allowed: [] }).ok,
    true
  );
});

test("validate_official_url rejects non-https and banned domains", () => {
  const whitelist = { allowed: ["example.gov"] };
  assert.equal(
    validateOfficialUrl("http://example.gov/path", whitelist).ok,
    false
  );
  assert.equal(
    validateOfficialUrl("https://wikipedia.org/wiki", whitelist).ok,
    false
  );
});
