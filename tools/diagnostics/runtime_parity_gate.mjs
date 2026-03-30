#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { chromium, webkit } from "@playwright/test";
import { acquireProjectProcessSlot } from "../runtime/processSlots.mjs";

const root = process.cwd();
const artifactsDir = path.join(root, "Artifacts");
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const expectedOrigin = "http://127.0.0.1:3000";
const expectedSnapshotBuiltAt = (() => {
  try {
    const snapshot = JSON.parse(fsSync.readFileSync(path.join(root, "data", "ssot_snapshots", "latest.json"), "utf8"));
    return String(snapshot?.generated_at || "UNCONFIRMED");
  } catch {
    return "UNCONFIRMED";
  }
})();

function pickVisibleStampAttributes(attributes = {}) {
  return {
    buildId: String(attributes.buildId || "UNCONFIRMED"),
    commit: String(attributes.commit || "UNCONFIRMED"),
    builtAt: String(attributes.builtAt || "UNCONFIRMED"),
    datasetHash: String(attributes.datasetHash || "UNCONFIRMED"),
    finalSnapshotId: String(attributes.finalSnapshotId || "UNCONFIRMED"),
    snapshotBuiltAt: String(attributes.snapshotBuiltAt || "UNCONFIRMED"),
    runtimeMode: String(attributes.runtimeMode || "UNCONFIRMED"),
    mapRenderer: String(attributes.mapRenderer || "UNCONFIRMED"),
    mapRuntime: String(attributes.mapRuntime || "UNCONFIRMED"),
    expectedOrigin: String(attributes.expectedOrigin || "UNCONFIRMED"),
    devServerPid: String(attributes.devServerPid || "UNCONFIRMED"),
    sessionMarker: String(attributes.sessionMarker || "UNCONFIRMED")
  };
}

function diffIdentity(origin, visible, api, runtime) {
  const mismatches = [];
  if (origin !== expectedOrigin) mismatches.push({ field: "origin", ui: origin, expected: expectedOrigin });
  if (String(api.origin || "UNCONFIRMED") !== expectedOrigin) {
    mismatches.push({ field: "api.origin", api: api.origin || "UNCONFIRMED", expected: expectedOrigin });
  }
  if (visible.expectedOrigin !== expectedOrigin || api.expectedOrigin !== expectedOrigin || runtime.expectedOrigin !== expectedOrigin) {
    mismatches.push({
      field: "expectedOrigin",
      ui: visible.expectedOrigin,
      api: api.expectedOrigin,
      runtime: runtime.expectedOrigin,
      expected: expectedOrigin
    });
  }
  const checks = [
    ["buildId", visible.buildId, api.buildId, runtime.buildId],
    ["commit", visible.commit, api.commit || api.buildSha, runtime.commit],
    ["builtAt", visible.builtAt, api.builtAt || api.buildTime, runtime.builtAt],
    ["datasetHash", visible.datasetHash, api.datasetHash, runtime.datasetHash],
    ["finalSnapshotId", visible.finalSnapshotId, api.finalSnapshotId, runtime.finalSnapshotId],
    ["snapshotBuiltAt", visible.snapshotBuiltAt, api.snapshotBuiltAt, runtime.snapshotBuiltAt],
    ["runtimeMode", visible.runtimeMode, api.runtimeMode, runtime.runtimeMode],
    ["mapRuntime", visible.mapRuntime, api.mapRuntime, runtime.mapRuntime]
  ];
  for (const [field, uiValue, apiValue, runtimeValue] of checks) {
    if (!(uiValue === apiValue && uiValue === runtimeValue)) {
      mismatches.push({ field, ui: uiValue, api: apiValue, runtime: runtimeValue });
    }
  }
  if (!api.commit || String(api.commit).trim() === "" || String(api.commit).toLowerCase() === "unknown") {
    mismatches.push({ field: "commit", api: api.commit || "UNCONFIRMED", expected: "non-empty git sha" });
  }
  if (String(api.snapshotBuiltAt || "") !== expectedSnapshotBuiltAt) {
    mismatches.push({
      field: "snapshotBuiltAtLatest",
      api: api.snapshotBuiltAt || "UNCONFIRMED",
      expected: expectedSnapshotBuiltAt
    });
  }
  return mismatches;
}

async function withBrowser(browserName, task) {
  const browserType = browserName === "webkit" ? webkit : chromium;
  const slot = await acquireProjectProcessSlot(`playwright:${browserName}:runtime-parity-gate`);
  const browser = await browserType.launch(browserName === "chromium" ? { headless: false } : { headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    return await task(page);
  } finally {
    await context.close();
    await browser.close();
    await slot.release();
  }
}

async function collect(browserName) {
  return withBrowser(browserName, async (page) => {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='runtime-stamp']", { timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__MAP_DEBUG__?.runtimeStamp), undefined, { timeout: 30000 });
    await page.screenshot({ path: path.join(artifactsDir, `runtime-identity-${browserName}.png`), fullPage: true });
    const pageData = await page.evaluate(async () => {
      const node = document.querySelector("[data-testid='runtime-stamp']");
      const visible = node
        ? {
            text: String(node.textContent || "").replace(/\s+/g, " ").trim(),
            buildId: node.getAttribute("data-build-id"),
            commit: node.getAttribute("data-commit"),
            builtAt: node.getAttribute("data-built-at"),
            datasetHash: node.getAttribute("data-dataset-hash"),
            finalSnapshotId: node.getAttribute("data-final-snapshot-id"),
            snapshotBuiltAt: node.getAttribute("data-snapshot-built-at"),
            runtimeMode: node.getAttribute("data-runtime-mode"),
            mapRenderer: node.getAttribute("data-map-renderer"),
            mapRuntime: node.getAttribute("data-map-runtime"),
            expectedOrigin: node.getAttribute("data-expected-origin"),
            devServerPid: node.getAttribute("data-dev-server-pid"),
            sessionMarker: node.getAttribute("data-session-marker")
          }
        : null;
      let api = null;
      try {
        const response = await fetch("/api/build-meta", { cache: "no-store" });
        if (response.ok) api = await response.json();
      } catch {
        api = null;
      }
      return {
        origin: window.location.origin,
        href: window.location.href,
        visible,
        api,
        runtime: window.__MAP_DEBUG__?.runtimeStamp || null
      };
    });
    const visible = pickVisibleStampAttributes(pageData.visible || {});
    const api = pageData.api || {};
    const runtime = pageData.runtime || {};
    const mismatches = diffIdentity(pageData.origin, visible, api, runtime);
    return {
      browserName,
      origin: pageData.origin,
      href: pageData.href,
      visible,
      visibleText: pageData.visible?.text || "",
      api,
      runtime,
      mismatches,
      pass: mismatches.length === 0
    };
  });
}

await fs.mkdir(artifactsDir, { recursive: true });
const runs = [await collect("chromium"), await collect("webkit")];
const pass = runs.every((run) => run.pass === true);
const payload = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  expectedOrigin,
  expectedSnapshotBuiltAt,
  pass,
  runs
};
const diffPayload = {
  generatedAt: payload.generatedAt,
  pass,
  diffs: runs.flatMap((run) =>
    run.mismatches.map((mismatch) => ({
      browserName: run.browserName,
      ...mismatch
    }))
  )
};

await fs.writeFile(path.join(artifactsDir, "runtime-parity-gate.json"), JSON.stringify(payload, null, 2));
await fs.writeFile(path.join(artifactsDir, "localhost-vs-playwright-diff.json"), JSON.stringify(diffPayload, null, 2));
try {
  await fs.copyFile(
    path.join(artifactsDir, "runtime-identity-chromium.png"),
    path.join(artifactsDir, "runtime-identity-screenshot.png")
  );
} catch {
  // keep browser-specific screenshots only
}
await fs.writeFile(
  path.join(artifactsDir, "runtime-identity.json"),
  JSON.stringify(
    {
      generatedAt: payload.generatedAt,
      expectedOrigin,
      expectedSnapshotBuiltAt,
      pass,
      runs: runs.map((run) => ({
        browserName: run.browserName,
        origin: run.origin,
        visible: run.visible,
        api: run.api,
        runtime: run.runtime,
        pass: run.pass
      }))
    },
    null,
    2
  )
);

console.log(`RUNTIME_IDENTITY_OK=${pass ? 1 : 0}`);
console.log(`ORIGIN_OK=${runs.every((run) => run.origin === expectedOrigin) ? 1 : 0}`);
console.log(`COMMIT_OK=${runs.every((run) => String(run.api?.commit || "").toLowerCase() !== "unknown" && String(run.api?.commit || "").trim() !== "") ? 1 : 0}`);
console.log(`SNAPSHOT_OK=${runs.every((run) => String(run.api?.snapshotBuiltAt || "") === expectedSnapshotBuiltAt) ? 1 : 0}`);
console.log(JSON.stringify({ pass, runs: runs.map((run) => ({ browserName: run.browserName, pass: run.pass, mismatches: run.mismatches.length })) }, null, 2));
process.exit(pass ? 0 : 1);
