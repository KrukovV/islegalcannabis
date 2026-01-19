import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { extractWikiRefs } from "./wiki_refs.mjs";

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

test("wiki refs extraction filters official candidates", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-wiki-refs-"));
  const prevCwd = process.cwd();
  const prevEnv = { ...process.env };
  try {
    process.chdir(tmpDir);
    const fixtureDir = path.join(prevCwd, "tools", "wiki", "fixtures");
    process.env.WIKI_FIXTURE_DIR = fixtureDir;

    writeJson(path.join(tmpDir, "data", "sources", "allow_domains.json"), {
      allow_suffixes: ["go.th"],
      country_allow_domains: { TH: ["moph.go.th"] }
    });
    writeJson(path.join(tmpDir, "data", "sources", "domain_denylist.json"), { banned: [] });

    const result = await extractWikiRefs({
      geoKey: "TH",
      iso2: "TH",
      articles: [{ title: "Cannabis in Thailand" }],
      reportPath: path.join(tmpDir, "Reports", "wiki_refs", "TH.json")
    });

    assert.equal(result.counts.official, 1);
    assert.equal(result.counts.supporting, 1);
    assert.ok(result.official_candidates[0].url.includes("moph.go.th"));
    assert.ok(result.official_candidates[0].reason.startsWith("ALLOW_RULE_"));
    assert.ok(result.top_hosts.length > 0);
  } finally {
    process.env = prevEnv;
    process.chdir(prevCwd);
  }
});
