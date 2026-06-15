import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ensureVercelBypassState,
  getBypassStatePath,
  redactBypassStateForReport
} from "./lib/vercel-bypass-session.mjs";

function fakeResponse({ status = 200, challenge = false, url = "https://www.islegal.info/" } = {}) {
  return {
    status: () => status,
    url: () => url,
    headers: () => challenge ? { "x-vercel-mitigated": "challenge", "content-type": "text/html" } : { "content-type": "text/html" },
    text: async () => challenge ? "Vercel Security Checkpoint" : "Is cannabis legal?"
  };
}

function makeBrowser({ challenge = false } = {}) {
  const stats = { contexts: 0, warmups: 0, storageWrites: 0 };
  const browser = {
    stats,
    async newContext() {
      stats.contexts += 1;
      return {
        request: {
          async get() {
            stats.warmups += 1;
            return fakeResponse({ status: challenge ? 403 : 200, challenge, url: "https://www.islegal.info/" });
          }
        },
        async cookies() { return []; },
        async storageState({ path: statePath }) {
          stats.storageWrites += 1;
          await fsp.mkdir(path.dirname(statePath), { recursive: true });
          await fsp.writeFile(statePath, JSON.stringify({ cookies: [{ name: "__vercel_bypass", value: "redacted", domain: "www.islegal.info", path: "/" }], origins: [] }));
        },
        async newPage() {
          return {
            async goto() { return fakeResponse({ status: challenge ? 403 : 200, challenge, url: "https://www.islegal.info/new-map?qa=1" }); },
            async title() { return challenge ? "Security Checkpoint" : "Is cannabis legal?"; },
            url() { return "https://www.islegal.info/new-map?qa=1"; },
            locator(selector) {
              return {
                async count() { return challenge ? 0 : selector === "body" ? 1 : 1; },
                async innerText() { return challenge ? "Vercel Security Checkpoint" : "Is cannabis legal?"; }
              };
            },
            async close() {}
          };
        },
        async close() {}
      };
    }
  };
  return browser;
}

async function withSecret(fn) {
  const previous = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "test-session-secret-not-real";
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = previous;
  }
}

test("existing fresh storageState can be reused without warmup", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "vercel-state-"));
  const statePath = path.join(dir, "state.json");
  await fsp.writeFile(statePath, JSON.stringify({ cookies: [{ name: "__vercel_bypass", value: "token", domain: "www.islegal.info", path: "/" }], origins: [] }));
  const browser = makeBrowser();
  const result = await ensureVercelBypassState({ browser, baseUrl: "https://www.islegal.info", statePath, validateExisting: false });
  assert.equal(result.result, "PASS");
  assert.equal(result.storage_state_used, true);
  assert.equal(result.bypass_warmup_count, 0);
  assert.equal(browser.stats.warmups, 0);
});

test("missing storageState performs exactly one controlled warmup and writes state", async () => {
  await withSecret(async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "vercel-state-"));
    const statePath = path.join(dir, "state.json");
    const browser = makeBrowser();
    const result = await ensureVercelBypassState({ browser, baseUrl: "https://www.islegal.info", statePath });
    assert.equal(result.result, "PASS");
    assert.equal(result.bypass_warmup_count, 1);
    assert.equal(browser.stats.warmups, 1);
    assert.equal(browser.stats.storageWrites, 1);
    assert.equal(fs.existsSync(statePath), true);
  });
});

test("challenge during controlled warmup stops before matrix", async () => {
  await withSecret(async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "vercel-state-"));
    const statePath = path.join(dir, "state.json");
    const browser = makeBrowser({ challenge: true });
    await assert.rejects(
      () => ensureVercelBypassState({ browser, baseUrl: "https://www.islegal.info", statePath, stopOnChallenge: true }),
      /VERCEL_CHALLENGE_WINDOW/
    );
    assert.equal(browser.stats.warmups, 1);
    assert.equal(fs.existsSync(statePath), false);
  });
});

test("storageState path is local auth and gitignored", () => {
  assert.ok(getBypassStatePath({ statePath: "playwright/.auth/vercel-bypass.production.json" }).endsWith("playwright/.auth/vercel-bypass.production.json"));
  const gitignore = fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
  assert.match(gitignore, /playwright\/\.auth\//);
});

test("redacted storageState report never exposes cookie values", () => {
  const report = redactBypassStateForReport({ cookies: [{ name: "__vercel_bypass", value: "secret-cookie", domain: "www.islegal.info" }] });
  assert.equal(JSON.stringify(report).includes("secret-cookie"), false);
  assert.equal(report.storage_state_cookie_count, 1);
  assert.equal(report.secret_leak_guard, "PASS");
});
