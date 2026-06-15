import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSameOrigin,
  normalizeProdBaseUrl,
  prodUrl,
  sameOrigin
} from "./lib/prod-origin.mjs";

test("normalizes production base URL to one HTTPS origin", () => {
  assert.equal(normalizeProdBaseUrl("https://www.islegal.info/new-map?qa=1"), "https://www.islegal.info");
  assert.equal(prodUrl("https://www.islegal.info/new-map?qa=1", "/new-map?qa=1"), "https://www.islegal.info/new-map?qa=1");
});

test("catches apex/www mismatch before browser navigation", () => {
  assert.equal(sameOrigin("https://www.islegal.info/", "https://www.islegal.info/new-map?qa=1"), true);
  assert.throws(
    () => assertSameOrigin("https://islegal.info/", "https://www.islegal.info/new-map?qa=1"),
    /ORIGIN_MISMATCH/
  );
});

test("rejects non-https production origins", () => {
  assert.throws(() => normalizeProdBaseUrl("http://www.islegal.info"), /PROD_BASE_URL_MUST_BE_HTTPS/);
});
