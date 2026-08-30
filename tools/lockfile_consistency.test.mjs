import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

const packageJson = JSON.parse(
  fs.readFileSync(path.join(ROOT, "apps/web/package.json"), "utf8")
);
const npmLock = JSON.parse(
  fs.readFileSync(path.join(ROOT, "apps/web/package-lock.json"), "utf8")
);
const pnpmLock = yaml.load(
  fs.readFileSync(path.join(ROOT, "apps/web/pnpm-lock.yaml"), "utf8")
);

const dependencySections = ["dependencies", "devDependencies"];

test("npm lock direct dependency specs exactly match apps/web/package.json", () => {
  const importer = npmLock?.packages?.[""];
  assert.ok(importer, "apps/web/package-lock.json must contain its root importer");

  for (const section of dependencySections) {
    assert.deepEqual(importer[section] || {}, packageJson[section] || {});
  }
});

test("pnpm lock direct dependency specs exactly match apps/web/package.json", () => {
  const importer = pnpmLock?.importers?.["."];
  assert.ok(importer, "apps/web/pnpm-lock.yaml must contain the apps/web importer");

  for (const section of dependencySections) {
    const lockedSpecs = Object.fromEntries(
      Object.entries(importer[section] || {}).map(([name, value]) => [
        name,
        value?.specifier
      ])
    );
    assert.deepEqual(lockedSpecs, packageJson[section] || {});
  }
});

test("both lockfiles resolve the requested Next.js version", () => {
  const requestedNext = packageJson.dependencies.next;
  assert.equal(npmLock?.packages?.["node_modules/next"]?.version, requestedNext);

  const pnpmNext = pnpmLock?.importers?.["."]?.dependencies?.next?.version || "";
  assert.match(pnpmNext, new RegExp(`^${requestedNext.replaceAll(".", "\\.")}(?:\\(|$)`));
});
