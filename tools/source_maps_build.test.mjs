import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const webRoot = path.join(repoRoot, "apps", "web");
const nextConfigPath = path.join(webRoot, "next.config.ts");
const nextBuildManifestPath = path.join(webRoot, ".next", "build-manifest.json");
const chunksDir = path.join(webRoot, ".next", "static", "chunks");

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

test("production browser source maps are enabled and emitted for client chunks", () => {
  const config = fs.readFileSync(nextConfigPath, "utf8");
  assert.match(config, /productionBrowserSourceMaps\s*:\s*true/);
  const buildManifest = JSON.parse(fs.readFileSync(nextBuildManifestPath, "utf8"));
  const polyfillFiles = new Set(
    (buildManifest.polyfillFiles || []).map((file) => path.join(webRoot, ".next", file))
  );

  const files = walk(chunksDir);
  const jsFiles = files.filter((file) => file.endsWith(".js"));
  const mapFiles = new Set(files.filter((file) => file.endsWith(".js.map")));
  const largeJsFiles = jsFiles
    .map((file) => ({ file, bytes: fs.statSync(file).size }))
    .filter((entry) => !polyfillFiles.has(entry.file))
    .filter((entry) => entry.bytes >= 32 * 1024)
    .sort((a, b) => b.bytes - a.bytes);

  assert.ok(mapFiles.size > 0, "expected .next/static/chunks to contain JavaScript source maps");
  assert.ok(largeJsFiles.length > 0, "expected at least one large client JavaScript chunk");

  for (const { file } of largeJsFiles.slice(0, 12)) {
    const source = fs.readFileSync(file, "utf8");
    const match = source.match(/\/\/# sourceMappingURL=([^\s]+\.js\.map)\s*$/);
    assert.ok(match, `missing sourceMappingURL comment in ${path.relative(repoRoot, file)}`);
    const sourceMapPath = path.resolve(path.dirname(file), match[1]);
    assert.ok(
      mapFiles.has(sourceMapPath),
      `missing referenced source map ${path.relative(repoRoot, sourceMapPath)} for ${path.relative(repoRoot, file)}`
    );
  }
});
