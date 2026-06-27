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
  assert.ok(!profile.sections.products.some((sentence) => /\b(hachich|kif|tekrouri)\b/i.test(sentence)));
  assert.match(profile.sections.traditional_use.join(" "), /Traditional preparations/);
  assert.match(profile.sections.enforcement_notes.join(" "), /Enforcement remains active/);
  assert.match(profile.sections.market.join(" "), /cross-border trade supplied local markets/i);
  assert.ok(
    !profile.sections.cultivation.some((sentence) => /cross-border trade supplied local markets/i.test(sentence))
  );
  assert.ok(
    !profile.sections.market.some((sentence) => /Enforcement remains active/i.test(sentence))
  );
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

test("mergeProfiles replaces stale alias-titled state cannabis pages with canonical harvested content", () => {
  const existing = {
    geo: "US-WA",
    country: "Washington",
    wiki_title: "Cannabis in Washington",
    wiki_url: "https://en.wikipedia.org/wiki/Cannabis_in_Washington",
    source_type: "wikipedia_cannabis_article",
    sections: {
      ...blankSections(),
      products: ["Cannabis in Washington relates to a number of legislative, legal, and cultural events surrounding the use of cannabis (marijuana, hashish, THC, kief, etc.)."]
    },
    local_names: []
  };
  const harvested = {
    geo: "US-WA",
    country: "Washington",
    wiki_title: "Cannabis in Washington (state)",
    wiki_url: "https://en.wikipedia.org/wiki/Cannabis_in_Washington_(state)",
    source_type: "wikipedia_cannabis_article",
    sections: {
      ...blankSections(),
      history: ["Washington legalized recreational cannabis in 2012."],
      products: []
    },
    local_names: []
  };

  const merged = mergeProfiles(existing, harvested);

  assert.ok(merged.sections.history.some((sentence) => /legalized recreational cannabis in 2012/i.test(sentence)));
  assert.equal(merged.sections.products.length, 0);
  assert.equal(merged.wiki_title, "Cannabis in Washington (state)");
});

test("heading-aware extraction keeps history separate from penalties and market boilerplate", () => {
  const profile = extractKnowledgeFromText({
    geo: "JP",
    country: "Japan",
    wikiTitle: "Cannabis in Japan",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Japan",
    wikitext: `
== History ==
=== Prehistoric and ancient Japan ===
Cannabis was likely introduced roughly 18,000 years ago and hemp fiber was used for clothing and ritual cleansing.
== Legal status ==
=== Penalties and violations ===
Use and possession are punishable by up to 5 years imprisonment and a fine.
=== Legislation and policy ===
Following the Second World War, a prohibition on cannabis possession and production was enacted in 1948.
== Modern use ==
=== As hemp ===
The cultivation of commercial cannabis hemp is permitted under a strictly regulated licensing system.
`
  });

  assert.match(profile.sections.history.join(" "), /18,000 years ago|ritual cleansing/i);
  assert.match(profile.sections.enforcement_notes.join(" "), /5 years imprisonment/i);
  assert.match(profile.sections.cultivation.join(" "), /strictly regulated licensing system/i);
  assert.ok(!profile.sections.history.some((sentence) => /5 years imprisonment/i.test(sentence)));
  assert.ok(!profile.sections.market.some((sentence) => /5 years imprisonment/i.test(sentence)));
});

test("heading-aware extraction keeps cuba history out of laws and penalties sections", () => {
  const profile = extractKnowledgeFromText({
    geo: "CU",
    country: "Cuba",
    wikiTitle: "Cannabis in Cuba",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Cuba",
    wikitext: `
== History ==
Cannabis was introduced to Cuba as a textile crop in 1793.
In 1949, most cannabis found in Cuba was imported from Mexico.
== Laws in Cuba for carrying drugs ==
Medical or recreational use of marijuana is banned in Cuba.
Small amounts of possession are punishable by six months to two years in prison.
`
  });

  assert.match(profile.sections.history.join(" "), /textile crop in 1793|imported from Mexico/i);
  assert.match(profile.sections.enforcement_notes.join(" "), /six months to two years in prison|banned in Cuba/i);
  assert.ok(!profile.sections.history.some((sentence) => /six months to two years in prison|banned in Cuba/i.test(sentence)));
});

test("preserves legal case names and long quoted history lines without truncating them", () => {
  const profile = extractKnowledgeFromText({
    geo: "US-MT",
    country: "Montana",
    wikiTitle: "Cannabis in Montana",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Montana",
    wikitext: `
== Background ==
=== Prohibition (1929) ===
Cannabis was banned in Montana in 1929, following a Health Committee meeting which was described in the local paper as "great fun", during which representative Dr Fred Fulsher of Mineral County justified the ban due to marijuana's effects on Mexicans: "When some beet field peon takes a few rares of this stuff... he thinks he has just been elected president of Mexico so he starts out to execute all his political enemies."<ref>source</ref>
=== Kurth Ranch case ===
Following their prosecution on drug charges, the Kurths were informed that they also owed tax on their cannabis proceeds to the Montana Department of Revenue. In the case of ''Montana Department of Revenue v. Kurth Ranch'' (1994), the Supreme Court concluded that Montana's 1987 Dangerous Drug Tax Act was a punitive tax rather than normal revenue generation.
`
  });

  const combined = Object.values(profile.sections).flat().join(" ");
  assert.match(combined, /political enemies/i);
  assert.match(combined, /Montana Department of Revenue v\. Kurth Ranch/i);
  assert.ok(!profile.sections.history.some((sentence) => /\benem\.$/i.test(sentence)));
  assert.ok(!/\bv\.$/i.test(combined));
});

test("legal status and reform headings do not leak JP legal boilerplate into products, market, or enforcement", () => {
  const profile = extractKnowledgeFromText({
    geo: "JP",
    country: "Japan",
    wikiTitle: "Cannabis in Japan",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Japan",
    wikitext: `
== Legal status ==
=== Legislation and policy ===
The Cannabis Control Law is Japan's national law banning the import, export, cultivation, sale, purchase, and research of cannabis buds and leaves.
Industrial hemp is legal under Japanese law, though its cultivation is strictly regulated.
CBD is legal in Japan and been sold in the country since 2013. Many Japanese CBD manufacturers intentionally dissociate their products from marijuana.
Consumption of cannabis is legal, a legacy of an original provision of the Cannabis Control Law.
=== Penalties and violations ===
Possession of cannabis carries a penalty of up to five years imprisonment.
== Reform ==
In 2021, the Ministry of Health convened a panel of experts to make recommendations on potential revisions to the Cannabis Control Law.
In its report the panel recommended that cannabis consumption be formally criminalized and to permit clinical trials of cannabis-derived pharmaceuticals such as Epidiolex.
`
  });

  assert.ok(!profile.sections.products.some((sentence) => /CBD is legal in Japan/i.test(sentence)));
  assert.ok(!profile.sections.enforcement_notes.some((sentence) => /Consumption of cannabis is legal/i.test(sentence)));
  assert.ok(!profile.sections.enforcement_notes.some((sentence) => /Cannabis Control Law is Japan's national law banning/i.test(sentence)));
  assert.ok(!profile.sections.market.some((sentence) => /panel recommended/i.test(sentence)));
  assert.match(profile.sections.enforcement_notes.join(" "), /five years imprisonment/i);
  assert.match(profile.sections.history.join(" "), /panel recommended|convened a panel|Cannabis Control Law/i);
});

test("guyana keeps hemp ordinance in history and production in cultivation", () => {
  const profile = extractKnowledgeFromText({
    geo: "GY",
    country: "Guyana",
    wikiTitle: "Cannabis in Guyana",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Guyana",
    wikitext: `
'''Cannabis in Guyana''' is illegal for all uses, but is both grown and consumed in the nation. Possession of 15 grams or over can result in charges of drug trafficking.

==History==
===Indian community===
As in other parts of the British Caribbean, arriving indentured laborers from India brought the custom of smoking ganja with them, but this habit had fallen from fashion by the early part of the 20th century.
===Early legislation===
In 1861, British Guiana passed a law entitled An Ordinance to Regulate the Sale of Opium and Bhang.
===Indian Hemp Ordinance===
British Guiana passed its Indian Hemp Ordinance in 1913.
===Rastafarian usage===
In the 1970s, the Rastafari philosophy gained popularity in Guyana, and along with it came an increased interest in cannabis.
In 2015, Guyanese Rastafarians staged a demonstration at the Attorney General's office calling for the decriminalization of cannabis.

==Production==
Cannabis is generally sold within Guyana, rather than trafficked abroad.
Its cannabis grows year-round, and is of a high grade, but is largely consumed locally rather than exported.

==Enforcement==
Anti-cannabis operations are conducted by both the drug enforcement unit of the Guyana Police Force and by the Guyana Defence Force.
`
  });

  assert.match(profile.sections.history.join(" "), /Indian Hemp Ordinance|Sale of Opium and Bhang/i);
  assert.match(profile.sections.cultivation.join(" "), /sold within Guyana|grows year-round/i);
  assert.match(profile.sections.enforcement_notes.join(" "), /drug enforcement unit|Defence Force/i);
  assert.ok(!profile.sections.products.some((sentence) => /Indian Hemp Ordinance|grown and consumed in the nation/i.test(sentence)));
  assert.ok(!profile.sections.traditional_use.some((sentence) => /grown and consumed in the nation/i.test(sentence)));
});

test("legal CBD and derivative boilerplate does not inflate products", () => {
  const profile = extractKnowledgeFromText({
    geo: "ID",
    country: "Indonesia",
    wikiTitle: "Cannabis in Indonesia",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Indonesia",
    wikitext: `
'''Cannabis is illegal in Indonesia'''. Derivatives of medical and recreational cannabis (such as hemp, CBD, tetrahydrocannabinol, hashish, and edibles) are also illegal.
`
  });

  assert.equal(profile.sections.products.length, 0);
});

test("cbd pharmaceutical exception boilerplate does not inflate products", () => {
  const profile = extractKnowledgeFromText({
    geo: "SG",
    country: "Singapore",
    wikiTitle: "Cannabis in Singapore",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Singapore",
    wikitext: `
Medical cannabis is also not permitted, with very limited exceptions for cannabidiol (CBD) pharmaceuticals.
`
  });

  assert.equal(profile.sections.products.length, 0);
  assert.equal(profile.sections.notes.length, 0);
});

test("public support and wedge-issue copy stays in history instead of culture", () => {
  const profile = extractKnowledgeFromText({
    geo: "US-ID",
    country: "Idaho",
    wikiTitle: "Cannabis in Idaho",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Idaho",
    wikitext: `
As of 2018, support for the legalization of medical cannabis is broadly popular in the state, while legalization of the drug recreationally remains a wedge issue.
`
  });

  assert.ok(profile.sections.history.some((sentence) => /support for the legalization/i.test(sentence)));
  assert.equal(profile.sections.culture.length, 0);
});

test("patient-program growth does not count as cultivation", () => {
  const profile = extractKnowledgeFromText({
    geo: "US-IL",
    country: "Illinois",
    wikiTitle: "Cannabis in Illinois",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Illinois",
    wikitext: `
Since 2014, the Illinois Medical Cannabis Patient Program had significantly grown to over 143,000 qualifying patients participating in the state's medical cannabis and opioid alternative programs.
`
  });

  assert.equal(profile.sections.cultivation.length, 0);
  assert.ok(profile.sections.history.some((sentence) => /143,000 qualifying patients/i.test(sentence)));
});

test("penalty sentences mentioning cultivation stay in enforcement", () => {
  const profile = extractKnowledgeFromText({
    geo: "US-IN",
    country: "Indiana",
    wikiTitle: "Cannabis in Indiana",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Indiana",
    wikitext: `
Sale or cultivation of more than 10 lbs or within 1,000 feet of a school will result in a minimum of 2-8 years and a $10,000 fine.
`
  });

  assert.ok(profile.sections.enforcement_notes.some((sentence) => /2-8 years|10,000 fine/i.test(sentence)));
  assert.equal(profile.sections.cultivation.length, 0);
});

test("glossary-style preparation sentences stay out of products", () => {
  const profile = extractKnowledgeFromText({
    geo: "IN",
    country: "India",
    wikiTitle: "Cannabis in India",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_India",
    wikitext: `
In Indian society, common terms for cannabis preparations include charas (resin), ganja (flower), and bhang (seeds and leaves), with Indian drinks such as bhang lassi and bhang thandai made from bhang being one of the most common legal uses.
`
  });

  assert.equal(profile.sections.products.length, 0);
  assert.equal(profile.sections.culture.length, 0);
  assert.ok(profile.local_names.some((entry) => entry.term === "charas"));
  assert.ok(profile.local_names.some((entry) => entry.term === "ganja"));
  assert.ok(profile.local_names.some((entry) => entry.term === "bhang"));
});

test("referred-to-by-terms glossary copy stays out of products", () => {
  const profile = extractKnowledgeFromText({
    geo: "NG",
    country: "Nigeria",
    wikiTitle: "Cannabis in Nigeria",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Nigeria",
    wikitext: `
In addition to such widespread international terms as marijuana, hemp, ganja, and pot, cannabis in Nigeria is also referred to by terms such as kaya, wee-wee, igbo, oja, gbana, blau, kpoli, kpocha and abana.
`
  });

  assert.equal(profile.sections.products.length, 0);
  assert.ok(profile.local_names.some((entry) => entry.term === "ganja"));
});

test("availability-under-illegality copy stays out of culture", () => {
  const profile = extractKnowledgeFromText({
    geo: "LA",
    country: "Laos",
    wikiTitle: "Cannabis in Laos",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Laos",
    wikitext: `
== Culture ==
Cannabis is widely available in Laos despite its illegal status.
Some restaurants will have a "happy" menu where customers can get a variety of infused foods.
`
  });

  assert.equal(profile.sections.culture.some((sentence) => /widely available in Laos/i.test(sentence)), false);
  assert.ok(profile.sections.notes.some((sentence) => /widely available in Laos/i.test(sentence)));
  assert.ok(profile.sections.culture.some((sentence) => /happy\" menu|infused foods/i.test(sentence)));
});

test("smuggling-route copy stays out of traditional use", () => {
  const profile = extractKnowledgeFromText({
    geo: "MO",
    country: "Macau",
    wikiTitle: "Cannabis in Macau",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Macau",
    wikitext: `
Cannabis in Macau is illegal, but the territory has been used for illicit smuggling of cannabis.
Macau is noted as an area where cannabis commands a particularly high retail price.
`
  });

  assert.equal(profile.sections.traditional_use.length, 0);
  assert.ok(profile.sections.market.some((sentence) => /Macau has been used for illicit smuggling of cannabis/i.test(sentence)));
  assert.ok(profile.sections.market.some((sentence) => /high retail price/i.test(sentence)));
});

test("illegal-but-widely-produced-and-consumed copy stays out of culture", () => {
  const profile = extractKnowledgeFromText({
    geo: "PW",
    country: "Palau",
    wikiTitle: "Cannabis in Palau",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Palau",
    wikitext: `
Cannabis in Palau is illegal, but reports indicate the drug is widely produced and consumed on the island nation.
By the 1980s, cannabis had become the most valuable export crop of Palau.
`
  });

  assert.equal(profile.sections.culture.length, 0);
  assert.ok(profile.sections.market.some((sentence) => /Palau is widely produced and consumed|most valuable export crop/i.test(sentence)));
});

test("medicinal use heading reform copy stays in history instead of traditional use", () => {
  const profile = extractKnowledgeFromText({
    geo: "SC",
    country: "Seychelles",
    wikiTitle: "Cannabis in Seychelles",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Seychelles",
    wikitext: `
== Legalization efforts ==
=== Medicinal use ===
The 2017 petition sought to legalize cannabis for any use, including medical use.
After the petition, Ralph Vocere and his supporters decided to pursue the legality of medical cannabis first, with future plans to push for recreational legalization.
Volcere stated that he had a personal interest as his own mother suffered from Alzheimer's disease and required medicinal cannabis.
In February 2020, the regulations were gazetted with plans to go before the National Assembly for final debate and approval.
`
  });

  assert.equal(profile.sections.traditional_use.length, 0);
  assert.ok(profile.sections.history.some((sentence) => /petition sought to legalize cannabis/i.test(sentence)));
  assert.ok(profile.sections.history.some((sentence) => /Ralph Vocere and his supporters decided to pursue/i.test(sentence)));
  assert.ok(profile.sections.history.some((sentence) => /mother suffered from Alzheimer's disease and required medicinal cannabis/i.test(sentence)));
  assert.ok(profile.sections.history.some((sentence) => /regulations were gazetted|final debate and approval/i.test(sentence)));
});

test("canary cultivation and market facts drop legal-status boilerplate before rendering", () => {
  const profile = extractKnowledgeFromText({
    geo: "ZZ",
    country: "Exampleland",
    wikiTitle: "Cannabis in Exampleland",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Exampleland",
    wikitext: `
== Cultivation ==
Cannabis in Myanmar (Burma) is illegal but cultivated illicitly.
Cannabis is illegal in Vietnam, but is cultivated within the country and is known as.
There has been a legal challenge against Quebec's decision by a citizen who contested the ban on growing because the federal government allowed growing up to four plants per household.
== Economy ==
Cannabis in Papua New Guinea is illegal, but the nation is a significant producer and consumer of cannabis.
Cannabis is the only illegal drug produced in significant amounts in PNG, and is the most popular illegal drug consumed there.
`
  });

  assert.ok(profile.sections.cultivation.some((sentence) => /Myanmar \(Burma\) is cultivated illicitly/i.test(sentence)));
  assert.ok(!profile.sections.cultivation.some((sentence) => /is illegal|legal challenge|ban on growing/i.test(sentence)));
  assert.ok(!profile.sections.cultivation.some((sentence) => /known as\.?$/i.test(sentence)));
  assert.ok(profile.sections.history.some((sentence) => /legal challenge against Quebec/i.test(sentence)));
  assert.ok(profile.sections.market.some((sentence) => /Papua New Guinea is a significant producer and consumer/i.test(sentence)));
  assert.ok(profile.sections.market.some((sentence) => /only drug produced in significant amounts in PNG/i.test(sentence)));
  assert.ok(!profile.sections.market.some((sentence) => /is illegal|illegal drug/i.test(sentence)));
});

test("derived local names stay in local names instead of inflating products", () => {
  const profile = extractKnowledgeFromText({
    geo: "AF",
    country: "Afghanistan",
    wikiTitle: "Cannabis in Afghanistan",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Afghanistan",
    wikitext: `
Cannabis in Afghanistan is illegal.
Hashish had been made nominally illegal in 1957, but persisted as a common drug in the country.
One consumption custom in Afghanistan is eating melon along with hashish.
`
  });

  assert.ok(profile.sections.local_names.includes("hashish"));
  assert.equal(profile.sections.products.length, 0);
  assert.ok(!profile.sections.products.some((sentence) => /eating melon along with hashish/i.test(sentence)));
});

test("market headings keep legalization history out of market sections", () => {
  const profile = extractKnowledgeFromText({
    geo: "US-AK",
    country: "Alaska",
    wikiTitle: "Cannabis in Alaska",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Alaska",
    wikitext: `
== Market ==
The passage of Measure 2 made Alaska the third state to legalize the recreational use and sale of marijuana.
Licensed dispensaries opened in 2016 and retail shortages followed.
`
  });

  assert.match(profile.sections.history.join(" "), /Measure 2 made Alaska the third state to legalize/i);
  assert.match(profile.sections.market.join(" "), /Licensed dispensaries opened in 2016|retail shortages/i);
  assert.ok(!profile.sections.market.some((sentence) => /Measure 2 made Alaska the third state to legalize/i.test(sentence)));
});

test("generic cannabis products platform copy does not inflate products sections", () => {
  const profile = extractKnowledgeFromText({
    geo: "AU",
    country: "Australia",
    wikiTitle: "Cannabis in Australia",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Australia",
    wikitext: `
The app will also allow approved providers to prescribe medical cannabis products to regular patients without the need for multiple in-person visits.
On 12 November 2017, Food Standards Australia New Zealand made low-THC hemp food legal for human consumption in Australia.
`
  });

  assert.ok(!profile.sections.products.some((sentence) => /approved providers to prescribe medical cannabis products/i.test(sentence)));
  assert.ok(profile.sections.history.some((sentence) => /low-THC hemp food legal/i.test(sentence)));
});

test("belgium legal-reform boilerplate stays out of cultivation and market", () => {
  const profile = extractKnowledgeFromText({
    geo: "BE",
    country: "Belgium",
    wikiTitle: "Cannabis in Belgium",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Belgium",
    wikitext: `
Despite significant legal rework of cannabis-related laws since 2010, certain elements of the consumption and cultivation of cannabis are considered to exist within a legal grey area of Belgian law.
The legal effort to restrict cultivation and growth has gradually subsided, resulting in an increase of the growth and consumption of cannabis and cannabis-related products.
=== Legalisation efforts ===
Since 2001, the legal status cannabis within Belgium has been a growing area of political interest and debate.
`
  });

  assert.ok(profile.sections.history.some((sentence) => /political interest and debate/i.test(sentence)));
  assert.ok(!profile.sections.cultivation.some((sentence) => /political interest and debate/i.test(sentence)));
  assert.ok(
    !profile.sections.market.some((sentence) => /legal effort to restrict cultivation and growth has gradually subsided/i.test(sentence))
  );
});

test("tourism arrest and court copy stays in enforcement instead of market", () => {
  const profile = extractKnowledgeFromText({
    geo: "BZ",
    country: "Belize",
    wikiTitle: "Cannabis in Belize",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Belize",
    wikitext: `
==Tourism==
In 2016, an American tourist off a cruise ship was arrested for purchasing 1.8 grams of cannabis in Belize City.
Her charges were dismissed, with the judge noting the cannabis was sold openly to her and she appeared to believe it was legal, and she was cautioned against ever possessing drugs in Belize again.
`
  });

  assert.match(profile.sections.enforcement_notes.join(" "), /arrested for purchasing 1\.8 grams|charges were dismissed|judge/i);
  assert.ok(!profile.sections.market.some((sentence) => /arrested for purchasing 1\.8 grams|charges were dismissed|judge noting|cautioned/i.test(sentence)));
});

test("cannabis clubs legal-grey copy routes to market instead of culture", () => {
  const profile = extractKnowledgeFromText({
    geo: "ES",
    country: "Spain",
    wikiTitle: "Cannabis in Spain",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Spain",
    wikitext: `
== Culture ==
Using the legal grey areas in Spanish legislation, cannabis clubs are a popular way for enthusiasts to obtain and use cannabis as a technically legal private collective.
`
  });

  assert.equal(profile.sections.culture.length, 0);
  assert.ok(profile.sections.market.some((sentence) => /cannabis clubs are a popular way/i.test(sentence)));
});

test("comparative foreign-law cultivation copy stays out of cultivation", () => {
  const profile = extractKnowledgeFromText({
    geo: "CH",
    country: "Switzerland",
    wikiTitle: "Cannabis in Switzerland",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Switzerland",
    wikitext: `
== Cultivation ==
In Germany and other European countries, the growing of a limited amount of THC cannabis plants is legal, and cannabis up to 25g per person is no longer considered a narcotic in Germany.
`
  });

  assert.equal(profile.sections.cultivation.length, 0);
  assert.ok(profile.sections.history.some((sentence) => /other European countries|25g per person/i.test(sentence)));
});

test("contemporary legal-grey cannabis clubs copy routes to market from neutral headings", () => {
  const profile = extractKnowledgeFromText({
    geo: "ES",
    country: "Spain",
    wikiTitle: "Cannabis in Spain",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Spain",
    wikitext: `
== Contemporary Spain ==
Using the legal grey areas in Spanish legislation, cannabis clubs are a popular way for enthusiasts to obtain and use cannabis as a technically legal private collective.
`
  });

  assert.equal(profile.sections.culture.length, 0);
  assert.ok(profile.sections.market.some((sentence) => /technically legal private collective/i.test(sentence)));
});

test("comparative foreign-law copy under reform headings stays in history", () => {
  const profile = extractKnowledgeFromText({
    geo: "CH",
    country: "Switzerland",
    wikiTitle: "Cannabis in Switzerland",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Switzerland",
    wikitext: `
== Reform attempts ==
=== Decriminalisation ===
In Germany and other European countries, the growing of a limited amount of THC cannabis plants is legal, and cannabis up to 25g per person is no longer considered a narcotic in Germany.
`
  });

  assert.equal(profile.sections.cultivation.length, 0);
  assert.ok(profile.sections.history.some((sentence) => /other European countries|25g per person/i.test(sentence)));
});

test("history sale-restriction subheadings stay in history instead of market", () => {
  const profile = extractKnowledgeFromText({
    geo: "US-TX",
    country: "Texas",
    wikiTitle: "Cannabis in Texas",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Texas",
    wikitext: `
== History ==
=== 1919 Sale restricted ===
In 1919, legislation was enacted to prohibit the transfer of narcotics, including cannabis, for non-medical use.
Transfer of cannabis in this manner was made a misdemeanor crime; however, possession of the drug still remained legal.
`
  });

  assert.ok(profile.sections.history.some((sentence) => /1919, legislation was enacted/i.test(sentence)));
  assert.ok(
    profile.sections.enforcement_notes.some((sentence) => /Transfer of cannabis in this manner was made a misdemeanor crime/i.test(sentence))
  );
  assert.equal(profile.sections.market.length, 0);
});

test("current legal-status as-of-year boilerplate stays out of history", () => {
  const profile = extractKnowledgeFromText({
    geo: "GT",
    country: "Guatemala",
    wikiTitle: "Cannabis in Guatemala",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Guatemala",
    wikitext: `
Cannabis in Guatemala, as of 2016, is illegal.
== History ==
Otto Pérez, when he was president of the country, tried to lead a legalization drive, and several congressmen attempted to pass a law for legalization, but those efforts failed.
`
  });

  assert.ok(!profile.sections.history.some((sentence) => /as of 2016, is illegal/i.test(sentence)));
  assert.ok(profile.sections.history.some((sentence) => /tried to lead a legalization drive/i.test(sentence)));
});

test("lead legal-popularity boilerplate does not inflate culture when status is legal", () => {
  const profile = extractKnowledgeFromText({
    geo: "UY",
    country: "Uruguay",
    wikiTitle: "Cannabis in Uruguay",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Uruguay",
    wikitext: `
Cannabis is legal in Uruguay, and is one of the most widely used drugs in the nation.
President José Mujica signed legislation to legalize recreational cannabis in December 2013.
`
  });

  assert.equal(profile.sections.culture.length, 0);
  assert.ok(profile.sections.history.some((sentence) => /signed legislation to legalize recreational cannabis/i.test(sentence)));
});

test("industrial-hemp law-change copy stays out of products and traditional use", () => {
  const profile = extractKnowledgeFromText({
    geo: "VU",
    country: "Vanuatu",
    wikiTitle: "Cannabis in Vanuatu",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Vanuatu",
    wikitext: `
On September 20, 2018, the government's Council of Ministers issued Decision 157/2018 allowing for the establishment of industries for the production of medical cannabis and industrial hemp.
`
  });

  assert.equal(profile.sections.products.length, 0);
  assert.equal(profile.sections.traditional_use.length, 0);
});

test("lead possession penalties stay in enforcement instead of traditional use", () => {
  const profile = extractKnowledgeFromText({
    geo: "VE",
    country: "Venezuela",
    wikiTitle: "Cannabis in Venezuela",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Venezuela",
    wikitext: `
Cannabis in Venezuela is illegal. As of 15 September 2010 possession of up to 20 grams of marijuana, if proven not to be for medical or personal consumption, is punishable by 1 to 2 years in prison at judge's discretion. If deemed to be for personal consumption, the user is subject to security measures involving rehabilitation and detoxification procedures.
`
  });

  assert.equal(profile.sections.traditional_use.length, 0);
  assert.ok(profile.sections.enforcement_notes.some((sentence) => /1 to 2 years in prison/i.test(sentence)));
});

test("plain enforcement heading routes bhutan enforcement facts into enforcement notes", () => {
  const profile = extractKnowledgeFromText({
    geo: "BT",
    country: "Bhutan",
    wikiTitle: "Cannabis in Bhutan",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Bhutan",
    wikitext: `
==Enforcement==
Bhutan's first arrest for drug abuse occurred in 1989 in Gelephu, where a man was arrested for abusing cannabis.
In 2010 the Bhutanese government seized 4 kg of cannabis; in 2011 this increased to 75 kg.
`
  });

  assert.match(profile.sections.enforcement_notes.join(" "), /first arrest for drug abuse|seized 4 kg of cannabis/i);
  assert.ok(!profile.sections.history.some((sentence) => /first arrest for drug abuse|seized 4 kg of cannabis/i.test(sentence)));
});

test("history export and production facts can surface in market when they are trade-dominant", () => {
  const profile = extractKnowledgeFromText({
    geo: "BZ",
    country: "Belize",
    wikiTitle: "Cannabis in Belize",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Belize",
    wikitext: `
==History==
Until the 1980s, Belize was the fourth-largest exporter of cannabis to the United States.
By 1994, Belizean production was at negligible levels.
`
  });

  assert.match(profile.sections.market.join(" "), /fourth-largest exporter/i);
});

test("lead enforcement wording stays in enforcement instead of history", () => {
  const profile = extractKnowledgeFromText({
    geo: "KH",
    country: "Cambodia",
    wikiTitle: "Cannabis in Cambodia",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Cambodia",
    wikitext: `
Cannabis in Cambodia is illegal.
This prohibition is enforced opportunistically.
`
  });

  assert.match(profile.sections.enforcement_notes.join(" "), /enforced opportunistically/i);
  assert.ok(!profile.sections.history.some((sentence) => /enforced opportunistically/i.test(sentence)));
});

test("history legal-status sentence in central african republic stays in history", () => {
  const profile = extractKnowledgeFromText({
    geo: "CF",
    country: "Central African Republic",
    wikiTitle: "Cannabis in the Central African Republic",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_the_Central_African_Republic",
    wikitext: `
==History==
During the Central African Empire administration (1976-1979), production, possession, or sale of cannabis was illegal.
`
  });

  assert.match(profile.sections.history.join(" "), /production, possession, or sale of cannabis was illegal/i);
  assert.ok(
    !profile.sections.cultivation.some((sentence) => /production, possession, or sale of cannabis was illegal/i.test(sentence))
  );
});

test("history policy vote copy stays in history instead of market", () => {
  const profile = extractKnowledgeFromText({
    geo: "US-CO",
    country: "Colorado",
    wikiTitle: "Cannabis in Colorado",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Colorado",
    wikitext: `
==History==
Consumption in public was recently passed in Denver under Ordinance 300 with a vote of 53% for legal public consumption, and a 46% vote against.
`
  });

  assert.match(profile.sections.history.join(" "), /Ordinance 300|53%/i);
  assert.ok(!profile.sections.market.some((sentence) => /Ordinance 300|53%/i.test(sentence)));
});

test("cultivation headings that also mention laws still populate cultivation facts", () => {
  const profile = extractKnowledgeFromText({
    geo: "EC",
    country: "Ecuador",
    wikiTitle: "Cannabis in Ecuador",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Ecuador",
    wikitext: `
== Laws ==
=== Laws on Cannabis Cultivation ===
Cannabis cultivation is not commonly practiced in Ecuador. It is mostly a transit nation.
Cannabis production is only permitted in Ecuador for personal use.
However, in the prosecution's view, everyone who grows plants for his use is not a criminal, Where CBD is currently legal in Ecuador.
`
  });

  assert.match(profile.sections.cultivation.join(" "), /not commonly practiced in Ecuador|only permitted in Ecuador for personal use|grows plants for his use/i);
  assert.ok(!profile.sections.enforcement_notes.some((sentence) => /grows plants for his use/i.test(sentence)));
});

test("history context does not treat troop consumption bans as market facts", () => {
  const profile = extractKnowledgeFromText({
    geo: "EG",
    country: "Egypt / مصر",
    wikiTitle: "Cannabis in Egypt",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Egypt",
    wikitext: `
==History==
===French period===
As a result of the conspicuous consumption of hashish by the troops, the smoking of hashish and consumption of drinks containing it was banned in October 1800, although the troops mostly ignored the order.
==Cannabis culture==
The gozah is the traditional Egyptian water-pipe; a 1980 Egyptian study noted that smoking was the most popular method of cannabis consumption.
`
  });

  assert.ok(profile.sections.history.some((sentence) => /banned in October 1800/i.test(sentence)));
  assert.ok(!profile.sections.market.some((sentence) => /banned in October 1800/i.test(sentence)));
  assert.ok(profile.sections.culture.some((sentence) => /most popular method of cannabis consumption/i.test(sentence)));
});

test("lead drug-control status can seed enforcement when no other enforcement section exists", () => {
  const profile = extractKnowledgeFromText({
    geo: "SZ",
    country: "Eswatini",
    wikiTitle: "Cannabis in Eswatini",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Eswatini",
    wikitext: `
'''[[Cannabis]] in [[Eswatini|Eswatini (Swaziland)]]''' is a traditional crop called '''insangu''' in Swazi.
The plant is subject to drug control and remains illegal in almost all cases.
`
  });

  assert.ok(profile.sections.enforcement_notes.some((sentence) => /subject to drug control and remains illegal/i.test(sentence)));
});

test("legality of hemp under a cultivation parent stays in cultivation", () => {
  const profile = extractKnowledgeFromText({
    geo: "FJ",
    country: "Fiji / Viti",
    wikiTitle: "Cannabis in Fiji",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Fiji",
    wikitext: `
==Cultivation==
===Legality of hemp===
As of July 2022, hemp became legal in Fiji in an attempt to cultivate the beginning of industrialised use within the country due to its diversified and practical uses.
All hemp imported, grown or used for this newly established business must not contain more than a 1% concentration of tetrahydrocannabinol.
`
  });

  assert.match(profile.sections.cultivation.join(" "), /hemp became legal in Fiji|1% concentration of tetrahydrocannabinol/i);
  assert.equal(profile.sections.products.length, 0);
});

test("lead popularity copy with legal-status boilerplate does not inflate culture", () => {
  const profile = extractKnowledgeFromText({
    geo: "FR",
    country: "France",
    wikiTitle: "Cannabis in France",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_France",
    wikitext: `
Cannabis in France is a plant considered indigenous, although currently illegal for personal use except in cases of varieties or products containing low amounts of the main active compound, THC, but remains one of the most popular illegal drugs.
==History==
Cannabis is cultivated in France since the late Neolithic.
`
  });

  assert.equal(profile.sections.culture.length, 0);
});

test("lead illicit-popularity copy with legal-status boilerplate stays out of culture", () => {
  const profile = extractKnowledgeFromText({
    geo: "NA",
    country: "Namibia",
    wikiTitle: "Cannabis in Namibia",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Namibia",
    wikitext: `
Cannabis in Namibia is illegal for recreational and medicinal uses, but is the most popular illicit drug in the country.
==History==
Cannabis also has a history of use as a traditional medicine by local indigenous communities.
`
  });

  assert.equal(profile.sections.culture.length, 0);
});

test("lead widely-used-illegal-drug boilerplate stays out of culture", () => {
  const profile = extractKnowledgeFromText({
    geo: "NG",
    country: "Nigeria",
    wikiTitle: "Cannabis in Nigeria",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Nigeria",
    wikitext: `
Cannabis is illegal in Nigeria, yet the country is one of the most widely used illegal-drug markets in the region.
Cannabis is one of the most widely used illegal drugs in Nigeria.
`
  });

  assert.equal(profile.sections.culture.length, 0);
});

test("culture heading widely-used-illegal-drug boilerplate stays out of culture", () => {
  const profile = extractKnowledgeFromText({
    geo: "NG",
    country: "Nigeria",
    wikiTitle: "Cannabis in Nigeria",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Nigeria",
    wikitext: `
==Usage==
Cannabis is one of the most widely used illegal drugs in Nigeria.
`
  });

  assert.equal(profile.sections.culture.length, 0);
});

test("product inventory under legal-status heading still fills products without keeping pure legality boilerplate", () => {
  const profile = extractKnowledgeFromText({
    geo: "CY",
    country: "Cyprus",
    wikiTitle: "Cannabis in Cyprus",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Cyprus",
    wikitext: `
=== CBD Products' legal status ===
CBD products containing more than 0.2% of THC are illegal in Cyprus.
These are accessible in the form of edibles, cannabis-infused foods, lotions, cremes, cannabis oil, etc.
=== HHC Products' legal status ===
HHC in Cyprus is accessible in the different forms for any choice: dried, vaping, edibles, oils.
`
  });

  assert.ok(!profile.sections.products.some((sentence) => /0\.2% of THC are illegal in Cyprus/i.test(sentence)));
  assert.match(profile.sections.products.join(" "), /accessible in the form of edibles|dried, vaping, edibles, oils/i);
});

test("historical hemp-law penalty copy does not inflate products", () => {
  const profile = extractKnowledgeFromText({
    geo: "NG",
    country: "Nigeria",
    wikiTitle: "Cannabis in Nigeria",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_Nigeria",
    wikitext: `
==History==
===Legislative history===
In addition to international treaties to which Nigeria was a party, cannabis use in Nigeria was limited by a series of statutes, including the 1935 Dangerous Drugs Act while under British rule, and following independence the Indian Hemp Decree of 1966, and its amendments in 1975 and 1984.
The 1966 decree recommended the death penalty for hemp cultivation, while the 1975 decree removed the threat of capital punishment, and the 1984 amendment increased penalties and jail terms.
`
  });

  assert.equal(profile.sections.products.length, 0);
  assert.match(profile.sections.history.join(" "), /Indian Hemp Decree|1935 Dangerous Drugs Act/i);
  assert.match(profile.sections.history.join(" "), /death penalty for hemp cultivation|increased penalties and jail terms/i);
});

test("hemp legality and hashish penalties route out of products", () => {
  const profile = extractKnowledgeFromText({
    geo: "US-ND",
    country: "North Dakota",
    wikiTitle: "Cannabis in North Dakota",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_North_Dakota",
    wikitext: `
Cannabis in North Dakota is legal for medical use but illegal for recreational use.
The cultivation of hemp is currently legal in North Dakota.
==Prohibition==
In May 2019, penalties were reduced in the state, with possession resulting in a fine instead of jail time, however possession of any amount of hashish or concentrates is still a felony, with punishment up to 5 years in prison.
`
  });

  assert.equal(profile.sections.products.length, 0);
  assert.match(profile.sections.enforcement_notes.join(" "), /possession of any amount of hashish|punishment up to 5 years in prison/i);
});

test("industrial low-thc hemp legality copy routes to cultivation instead of products", () => {
  const profile = extractKnowledgeFromText({
    geo: "KP",
    country: "North Korea",
    wikiTitle: "Cannabis in North Korea",
    wikiUrl: "https://en.wikipedia.org/wiki/Cannabis_in_North_Korea",
    wikitext: `
However, a reply by journalist Keegan Hamilton in a 2014 article in The Guardian sought to debunk these as rumors.
Cannabis is cultivated industrially, but in the form of low-THC hemp, and while some people may cultivate personal amounts of psychoactive cannabis, its use is still illegal, though it is also unlikely to be punished severely.
`
  });

  assert.equal(profile.sections.products.length, 0);
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
  assert.ok(cacheIndex.get("Cannabis in Japan"));
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
