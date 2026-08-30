import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const output = execFileSync(process.execPath, ["tools/audit/no_map_imports.mjs"], {
  cwd: root,
  encoding: "utf8"
});
const payload = JSON.parse(fs.readFileSync(path.join(root, "Artifacts", "no-map-imports.json"), "utf8"));

assert.match(output, /^MAP_RUNTIME_REMOVED=1$/m);
assert.match(output, /^MAP_IMPORTS_FOUND=0$/m);
assert.match(output, /^LEGACY_MAP_ROUTES_REMOVED=1$/m);
assert.match(output, /^ACTIVE_MAP_ROUTES=.*apps\/web\/src\/app\/new-map\/page\.tsx/m);
assert.match(output, /^ACTIVE_MAP_ROUTES=.*apps\/web\/src\/app\/truth-map\/page\.tsx/m);
assert.deepEqual(payload.offendingFiles, []);
assert.deepEqual(payload.activeMapRoutes, [
  "apps/web/src/app/new-map/page.tsx",
  "apps/web/src/app/truth-map/page.tsx"
]);
