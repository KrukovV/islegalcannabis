#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REAUDIT_PATH = "data/reviews/wiki-truth-grey-color-reaudit-39.json";
const REVIEWS_PATH = "data/official/cannabis_law_visual_reviews.audit.json";
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const write = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);

const resolutions = {
  SCR: {
    reviewedAt: "2026-07-19T22:46:00.000Z",
    color: "ILLEGAL",
    method: "ALL_VISUALLY_VERIFIED_CLAIMANT_REGIMES_CONVERGE",
    reasonRu: "Свежая визуальная перепроверка закрывает SCR красным без выбора спорного суверена. Philippines RA 9522 относит Bajo de Masinloc / Scarborough Shoal к островам под заявленной юрисдикцией Philippines, а RA 9165 прямо определяет cannabis/marijuana/Indian hemp и устанавливает строгие уголовные запреты и наказания. Официальная китайская ветка заявляет Huangyan Island территорией China, а Criminal Law PRC в статьях 351 и 357 прямо называет marijuana и предусматривает строгую уголовную ответственность. Суверенитет остаётся спорным, но цветовой результат не спорен: каждая визуально проверенная применимая claimant-ветка даёт recreational=ILLEGAL, medical=NONE для общего территориального вывода и enforcement=STRICT. Поэтому SCR получает красный по правилу совпадения всех claimant-режимов; это не признание чьего-либо суверенитета.",
    officialStatusPatch: {
      recreational: "ILLEGAL_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      medical: "NONE_NO_TERRITORY_WIDE_MEDICAL_CANNABIS_ACCESS_PROVEN_UNDER_EITHER_CLAIMANT_BRANCH",
      enforcement: "STRICT_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
    },
    sources: [
      {
        title: "Philippines Supreme Court E-Library — RA 9522, Bajo de Masinloc scope",
        url: "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/23187",
        role: "CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-43/SCR/screenshots/SCR-judiciary-ra9522-bajo-de-masinloc-focused.png",
      },
      {
        title: "Philippines Dangerous Drugs Board — RA 9165 cannabis definition and penalties",
        url: "https://ddb.gov.ph//images/RA_9165/RA%209165.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-43/SCR/screenshots/SCR-ddb-ra9165-cannabis-definition-page05.png",
      },
      {
        title: "Lawphil — RA 9165 cannabis definition and penalties",
        url: "https://lawphil.net/statutes/repacts/ra2002/ra_9165_2002.html",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW_OFFICIAL_MIRROR",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-29/PGA/screenshots/PGA-lawphil-ra-9165-cannabis-definition-clean.png",
      },
      {
        title: "Embassy of China — Huangyan Island sovereignty and jurisdiction statement",
        url: "https://ph.china-embassy.gov.cn/eng/xwfb/201206/t20120608_1180427.htm",
        role: "CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/SCR-china-embassy-claim.png",
      },
      {
        title: "Supreme People's Court of China — Criminal Law articles 351 and 357 naming marijuana",
        url: "https://english.court.gov.cn/2015-12/01/c_761557_32.htm",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/CN/CN-official-criminal-law-cannabis-evidence.png",
      },
    ],
  },
};

const requested = process.argv.slice(2);
if (!requested.length) throw new Error(`Usage: ${path.basename(process.argv[1])} GEO [GEO ...]`);
for (const geo of requested) {
  if (!resolutions[geo]) throw new Error(`No zero-grey resolution registered for ${geo}`);
}

const reaudit = read(REAUDIT_PATH);
const reviews = read(REVIEWS_PATH);
for (const geo of requested) {
  const resolution = resolutions[geo];
  const row = reaudit.rows.find((candidate) => candidate.geo === geo);
  const review = reviews.rows.find((candidate) => candidate.geo === geo);
  if (!row || !review) throw new Error(`Missing audit row for ${geo}`);

  row.result = "COLOR_RESOLVED";
  row.reasonRu = resolution.reasonRu;
  row.officialStatusPatch = resolution.officialStatusPatch;
  row.freshOfficialSources = [...new Map([
    ...(row.freshOfficialSources || []),
    ...resolution.sources.map((source) => ({
      title: source.title,
      url: source.url,
      role: source.role,
      visualReview: `FRESH_HUMAN_VISUAL_ACCEPTANCE_${resolution.reviewedAt.slice(0, 10).replaceAll("-", "_")}`,
    })),
  ].map((source) => [source.url, source])).values()];

  review.zero_grey_completion = {
    reviewed_at: resolution.reviewedAt,
    resolution_method: resolution.method,
    derived_color: resolution.color,
    visual_verdict: "HUMAN_VISUALLY_ACCEPTED_WITH_EXPLICIT_SCOPE",
    sources: resolution.sources.map((source) => ({
      title: source.title,
      url: source.url,
      role: source.role,
      screenshot_path: source.screenshotPath,
    })),
    conclusion_ru: resolution.reasonRu,
  };
  review.project_comparison = {
    status: `COLOR_RESOLVED_${resolution.color}_${resolution.method}`,
    reason: resolution.reasonRu,
  };
}

reaudit.reviewedAt = requested
  .map((geo) => resolutions[geo].reviewedAt)
  .reduce((latest, value) => value > latest ? value : latest, reaudit.reviewedAt);
reaudit.resolvedColorCount = reaudit.rows.filter((row) => row.result === "COLOR_RESOLVED").length;
reaudit.retainedGreyCount = reaudit.rows.filter((row) => row.result === "HONEST_GREY_RETAINED").length;

write(REAUDIT_PATH, reaudit);
write(REVIEWS_PATH, reviews);
console.log(`ZERO_GREY_APPLIED=${requested.join(",")}`);
console.log(`COLOR_RESOLVED=${reaudit.resolvedColorCount}`);
console.log(`HONEST_GREY=${reaudit.retainedGreyCount}`);
