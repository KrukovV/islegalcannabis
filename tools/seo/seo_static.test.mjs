import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("robots allows rendering assets and advertises only the canonical full sitemap", () => {
  const robots = readFileSync(new URL("../../apps/web/public/robots.txt", import.meta.url), "utf8");
  assert.doesNotMatch(robots, /^Disallow:\s*\/_next\//m);
  assert.deepEqual(robots.match(/^Sitemap:\s*\S+$/gm), ["Sitemap: https://www.islegal.info/sitemap.xml"]);
  assert.match(robots, /^User-agent: Googlebot\nAllow: \/$/m);
});
