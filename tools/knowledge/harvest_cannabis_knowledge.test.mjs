import assert from "node:assert/strict";
import test from "node:test";
import { extractKnowledgeFromText, mergeProfiles } from "./harvest_cannabis_knowledge.mjs";

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
