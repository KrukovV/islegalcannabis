import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildLocalCannabisCacheIndex,
  buildHarvestWorklist,
  extractKnowledgeFromText,
  fetchProfileForScopeItem,
  loadScope,
  mergeProfiles
} from "./harvest_cannabis_knowledge.mjs";

function projectRoot() {
  return new URL("../../", import.meta.url).pathname;
}

function blankSections() {
  return {
    history: [],
    local_names: [],
    products: [],
    traditional_use: [],
    cannabis_foods: [],
    slang: [],
    cultivation: [],
    market: [],
    enforcement_notes: [],
    culture: [],
    notes: []
  };
}

test("extracts facts into the knowledge layer without summarizing status", () => {
  const profile = extractKnowledgeFromText({
    geo: "DZ",
    country: "Algeria",
    wikiTitle: "Cannabis in Algeria",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Algeria",
    wikitext: `
Cannabis in Algeria is mostly illegal, although widely consumed.
In 1854, John Morell wrote that in Algeria names of kif, hachich, and tekrouri were applied to hemp preparations.
Traditional preparations were smoked and consumed socially.
Enforcement remains active and severe in trafficking cases, though anecdotal reports suggest some leniency for small-scale personal use.
Cannabis cultivation expanded near rural farms, and cross-border trade supplied local markets.
`
  });

  assert.equal(profile.geo, "DZ");
  assert.match(profile.sections.history.join(" "), /1854/);
  assert.match(profile.sections.culture.join(" "), /widely consumed|socially/);
  assert.ok(profile.sections.local_names.includes("hachich"));
  assert.ok(profile.sections.local_names.includes("kif"));
  assert.ok(profile.sections.local_names.includes("tekrouri"));
  assert.ok(!profile.sections.local_names.some((term) => /were applied/.test(term)));
  assert.match(profile.sections.products.join(" "), /hachich|kif|tekrouri/);
  assert.match(profile.sections.traditional_use.join(" "), /Traditional preparations/);
  assert.match(profile.sections.enforcement_notes.join(" "), /Enforcement remains active/);
  assert.match(profile.sections.cultivation.join(" "), /cultivation expanded near rural farms/i);
  assert.match(profile.sections.market.join(" "), /cross-border trade supplied local markets/i);
});

test("keeps required seeded local names when Wikipedia text is thin", () => {
  const profile = extractKnowledgeFromText({
    geo: "AO",
    country: "Angola",
    wikiTitle: "Cannabis in Angola",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Angola",
    wikitext: "Cannabis in Angola is illegal."
  });

  assert.deepEqual(profile.sections.local_names.slice().sort(), ["diamba", "liamba"].sort());
});

test("extracts quoted common names from cannabis facts", () => {
  const profile = extractKnowledgeFromText({
    geo: "AU",
    country: "Australia",
    wikiTitle: "Cannabis in Australia",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Australia",
    wikitext: "Two common names for cannabis in Aboriginal English are \"gunja\" and \"yarndi\"."
  });

  assert.ok(profile.sections.local_names.includes("gunja"));
  assert.ok(profile.sections.local_names.includes("yarndi"));
});

test("mergeProfiles preserves old unique culture and new harvested facts", () => {
  const existing = extractKnowledgeFromText({
    geo: "KH",
    country: "Cambodia",
    wikiTitle: "Cannabis in Cambodia",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Cambodia",
    wikitext: "Happy pizza is a cannabis-infused food sold in restaurants."
  });
  const harvested = extractKnowledgeFromText({
    geo: "KH",
    country: "Cambodia",
    wikiTitle: "Cannabis in Cambodia",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Cambodia",
    wikitext: "Cannabis enforcement is often opportunistically enforced and sometimes tolerated."
  });
  const merged = mergeProfiles(existing, harvested);

  assert.ok(merged.sections.local_names.includes("happy pizza"));
  assert.match(merged.sections.enforcement_notes.join(" "), /opportunistically enforced|tolerated/);
});

test("mergeProfiles scrubs legacy wiki-markup garbage from stored profile sections", () => {
  const existing = {
    geo: "MA",
    country: "Morocco",
    wiki_title: "Cannabis in Morocco",
    wiki_url: "https://en.wikipedia.org/wiki/Cannabis_in_Morocco",
    revision_id: "1",
    source_type: "wikipedia_cannabis_article",
    sections: {
      ...blankSections(),
      history: [", Morocco|267x267px]] Cannabis in Morocco has been illegal since 1956."],
      culture: ["Further reading. * https://example.com Category:Politics of Morocco"]
    },
    local_names: []
  };
  const harvested = extractKnowledgeFromText({
    geo: "MA",
    country: "Morocco",
    wikiTitle: "Cannabis in Morocco",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Morocco",
    wikitext: "Cannabis in Morocco has been illegal since 1956. Cannabis culture remains visible in the Rif."
  });
  const merged = mergeProfiles(existing, harvested);

  assert.ok(merged.sections.history.some((sentence) => sentence === "Cannabis in Morocco has been illegal since 1956."));
  assert.ok(merged.sections.history.every((sentence) => !/\]\]|\[\[|\|267x267px/i.test(sentence)));
  assert.ok(merged.sections.culture.every((sentence) => !/Further reading|Category:/i.test(sentence)));
});

test("loadScope uses the canonical 300-entity wiki claims universe", () => {
  const scope = loadScope(projectRoot(), Number.POSITIVE_INFINITY, "");
  const geos = scope.map((item) => item.geo);
  const stateCount = scope.filter((item) => item.type === "state").length;

  assert.equal(scope.length, 300);
  assert.equal(new Set(geos).size, 300);
  assert.equal(stateCount, 50);
  assert.ok(geos.includes("US-CA"));
  assert.ok(geos.includes("GF"));
  assert.ok(geos.includes("AD"));
});

test("loadScope keeps dedicated cannabis pages and avoids generic-page-only resolver input", () => {
  const scope = loadScope(projectRoot(), Number.POSITIVE_INFINITY, "AG,GF");
  const antigua = scope.find((item) => item.geo === "AG");
  const frenchGuiana = scope.find((item) => item.geo === "GF");

  assert.equal(scope.length, 2);
  assert.equal(antigua?.legalWikiUrl, "https://en.wikipedia.org/wiki/Cannabis_in_Antigua_and_Barbuda");
  assert.equal(antigua?.claimWikiUrl, "https://en.wikipedia.org/wiki/Cannabis_in_Antigua_and_Barbuda");
  assert.equal(frenchGuiana?.legalWikiUrl, null);
  assert.equal(frenchGuiana?.claimWikiUrl, null);
});

test("buildLocalCannabisCacheIndex maps cached dedicated cannabis articles by canonical title", () => {
  const cacheIndex = buildLocalCannabisCacheIndex(projectRoot());

  assert.ok(cacheIndex.get("Cannabis in Afghanistan"));
  assert.ok(cacheIndex.get("Cannabis in Kenya"));
  assert.ok(cacheIndex.get("Cannabis in Micronesia"));
  assert.ok(cacheIndex.get("Cannabis in the Maldives"));
});

test("fetchProfileForScopeItem consumes local cache in cache-only mode", async () => {
  const scope = loadScope(projectRoot(), Number.POSITIVE_INFINITY, "AF");
  const cacheIndex = buildLocalCannabisCacheIndex(projectRoot());
  const profile = await fetchProfileForScopeItem(scope[0], null, { cacheOnly: true, localCacheIndex: cacheIndex });

  assert.equal(profile.geo, "AF");
  assert.equal(profile.source_type, "wikipedia_cannabis_article");
  assert.equal(profile.revision_id, "1266883542");
  assert.ok(profile.sections.history.length > 0);
});

test("buildHarvestWorklist can target unresolved dedicated pages from the popup audit", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "popup-profile-audit-"));
  const auditPath = path.join(tempRoot, "popup-profile-audit.json");
  const checkpointPath = path.join(tempRoot, "popup-profile-harvest-checkpoint.json");
  fs.writeFileSync(
    auditPath,
    `${JSON.stringify({
      generated_at: "2026-06-22T12:00:00.000Z",
      rows: [
        { id: "AF", name: "Afghanistan", processed: false, resolver_status: "individual_wiki_page" },
        { id: "AL", name: "Albania", processed: false, resolver_status: "individual_wiki_page" },
        { id: "DZ", name: "Algeria", processed: false, resolver_status: "individual_wiki_page" },
        { id: "AO", name: "Angola", processed: false, resolver_status: "individual_wiki_page" },
        { id: "AG", name: "Antigua and Barbuda", processed: false, resolver_status: "individual_wiki_page" },
        { id: "AX", name: "Aland Islands", processed: false, resolver_status: "no_individual_wiki_page" },
        { id: "US-CA", name: "California", processed: true, resolver_status: "individual_wiki_page" }
      ]
    }, null, 2)}\n`
  );
  const worklist = buildHarvestWorklist(projectRoot(), {
    limit: 5,
    onlyUnprocessedDedicated: true,
    auditPath,
    checkpointPath
  });

  assert.equal(worklist.filterMode, "only_unprocessed_dedicated");
  assert.equal(worklist.scope.length, 5);
  assert.ok(worklist.scope.every((item) => item.legalWikiUrl));
  assert.ok(worklist.selected.length >= worklist.scope.length);
});
