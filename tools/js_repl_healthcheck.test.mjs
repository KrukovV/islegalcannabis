import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("browser stack healthcheck reports removed js_repl, app-server, browser features, and skill issue", () => {
  const script = fs.readFileSync(path.join(ROOT, "tools", "js_repl_healthcheck.mjs"), "utf8");

  assert.match(script, /features", "list"/);
  assert.match(script, /doctor/);
  assert.match(script, /app-server", "daemon", "version"/);
  assert.match(script, /JS_REPL_STATUS=REMOVED_UPSTREAM/);
  assert.match(script, /APP_SERVER_STATUS=/);
  assert.match(script, /BROWSER_USE_STATUS=/);
  assert.match(script, /IN_APP_BROWSER_STATUS=/);
  assert.match(script, /PLAYWRIGHT_INTERACTIVE_ISSUE=/);
  assert.match(script, /SKILL_DEPENDS_ON_REMOVED_FEATURE/);
  assert.match(script, /browser-stack-audit\.md/);
  assert.match(script, /skill-depends-on-removed-feature\.md/);
});
