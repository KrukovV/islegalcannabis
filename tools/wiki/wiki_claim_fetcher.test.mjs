import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fetchWikiClaim } from "./wiki_claim_fetcher.mjs";

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

test("wiki claim fetcher parses country and state fixtures", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-wiki-claim-"));
  const prevCwd = process.cwd();
  const prevEnv = { ...process.env };
  try {
    process.chdir(tmpDir);
    const fixtureDir = path.join(prevCwd, "tools", "wiki", "fixtures");
    process.env.WIKI_FIXTURE_DIR = fixtureDir;

    writeJson(path.join(tmpDir, "data", "iso3166", "iso3166-1.json"), {
      entries: [
        { alpha2: "RU", name: "Russia" },
        { alpha2: "TH", name: "Thailand" },
        { alpha2: "XK", name: "Kosovo" },
        { alpha2: "US", name: "United States" }
      ]
    });
    writeJson(path.join(tmpDir, "data", "geo", "us_state_centroids.json"), {
      schema_version: 2,
      items: {
        "US-CA": { name: "California", lat: 0, lon: 0 }
      }
    });

    const th = await fetchWikiClaim("TH");
    assert.equal(th.ok, true);
    assert.equal(th.payload.recreational_status, "Legal");
    assert.equal(th.payload.medical_status, "Legal");
    assert.equal(th.payload.notes_main_articles.length, 1);

    const us = await fetchWikiClaim("US-CA");
    assert.equal(us.ok, true);
    assert.equal(us.payload.name_in_wiki, "California");
  } finally {
    process.env = prevEnv;
    process.chdir(prevCwd);
  }
});
