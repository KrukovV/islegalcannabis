import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  READONLY_SCOPE,
  assertInspectionUrl,
  assertProperty,
  makeServiceAccountAssertion,
  readSearchConsole
} from "./gsc_read.mjs";

test("service-account assertion requests only the read-only scope", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwt = makeServiceAccountAssertion({
    type: "service_account",
    client_email: "gsc-reader@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    token_uri: "https://oauth2.googleapis.com/token"
  }, 1000);
  const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
  assert.equal(claims.scope, READONLY_SCOPE);
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(jwt.split(".").length, 3);
});

test("property and inspection URL reject off-domain, query and noncanonical paths", () => {
  assert.equal(assertProperty("sc-domain:islegal.info"), "sc-domain:islegal.info");
  assert.equal(assertInspectionUrl("https://www.islegal.info/es/c/nld"), "https://www.islegal.info/es/c/nld");
  for (const url of [
    "https://evil.example/c/mng", "https://islegal.info/c/mng", "https://www.islegal.info/c/mng?q=1",
    "https://www.islegal.info/api/private", "https://www.islegal.info/c/mng#law-recreational"
  ]) assert.throws(() => assertInspectionUrl(url));
  assert.throws(() => assertProperty("sc-domain:evil.example"));
});

test("read-only request sequence cannot submit sitemaps or index URLs", async () => {
  const calls = [];
  const responses = [
    { siteEntry: [{ siteUrl: "sc-domain:islegal.info", permissionLevel: "siteRestrictedUser" }] },
    { sitemap: [{ path: "https://www.islegal.info/sitemap.xml", errors: 0 }] },
    { rows: [{ clicks: 10, impressions: 4440 }] },
    { inspectionResult: { indexStatusResult: { verdict: "PASS" } } }
  ];
  const request = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body && JSON.parse(options.body) });
    return { ok: true, json: async () => responses.shift() };
  };
  const result = await readSearchConsole({
    property: "sc-domain:islegal.info", token: "test-token",
    inspectionUrl: "https://www.islegal.info/c/mng",
    startDate: "2026-09-01", endDate: "2026-09-30", request
  });
  assert.equal(result.sitemaps.length, 1);
  assert.equal(result.inspection.indexStatusResult.verdict, "PASS");
  assert.deepEqual(calls.map(({ method }) => method), ["GET", "GET", "POST", "POST"]);
  assert.match(calls[2].url, /\/searchAnalytics\/query$/);
  assert.match(calls[3].url, /\/urlInspection\/index:inspect$/);
  assert.equal(calls[3].body.inspectionUrl, "https://www.islegal.info/c/mng");
  assert.equal(calls.some(({ url }) => /sitemaps\/[^/]+$|urlNotifications/.test(url)), false);
});

test("exact property access is required before any property reads", async () => {
  let count = 0;
  await assert.rejects(readSearchConsole({
    property: "sc-domain:islegal.info", token: "test-token",
    startDate: "2026-09-01", endDate: "2026-09-30",
    request: async () => { count++; return { ok: true, json: async () => ({ siteEntry: [] }) }; }
  }), /lacks access/);
  assert.equal(count, 1);
});
