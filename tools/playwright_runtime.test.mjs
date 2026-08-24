import assert from "node:assert/strict";
import test from "node:test";
import { chromium, playwrightRuntime, webkit } from "./playwright_runtime.mjs";

test("root browser audits use the apps/web Playwright runtime", () => {
  assert.equal(playwrightRuntime.source, "apps/web");
  assert.equal(playwrightRuntime.version, "1.61.1");
  assert.match(playwrightRuntime.testModulePath, /apps\/web\/node_modules/);
  assert.equal(playwrightRuntime.chromiumRevision, "1228");
  assert.equal(playwrightRuntime.webkitRevision, "2311");
  assert.match(chromium.executablePath(), /chromium-1228/);
  assert.match(webkit.executablePath(), /webkit-2311/);
});
