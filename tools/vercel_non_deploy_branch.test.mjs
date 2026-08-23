import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const NON_DEPLOY_BRANCH = "codex/preserve-full-worktree-20260823";

for (const relativePath of ["vercel.json", "apps/web/vercel.json"]) {
  test(`${relativePath} disables Vercel Git deployment for the integration branch`, () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(ROOT, relativePath), "utf8")
    );

    assert.equal(
      config?.git?.deploymentEnabled?.[NON_DEPLOY_BRANCH],
      false,
      `${NON_DEPLOY_BRANCH} must not create Production or Preview deployments`
    );
  });
}
