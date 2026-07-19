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
  KAS: {
    reviewedAt: "2026-07-19T23:04:24.000Z",
    color: "LIMITED_OR_MEDICAL",
    method: "CONSERVATIVE_INTERSECTION_OF_ALL_VISUALLY_VERIFIED_CLAIMANT_REGIMES",
    reasonRu: "Свежая визуальная перепроверка закрывает KAS жёлтым без выбора суверена. Официальный India Code NDPS Act визуально действует на всю India, определяет cannabis (hemp), запрещает выращивание, производство, владение, продажу, покупку, перевозку, употребление и потребление, но прямо сохраняет лицензируемое исключение для medical/scientific purposes; section 20 устанавливает cannabis-specific наказания. Действующий официальный Pakistan Code CNSA 1997 визуально определяет cannabis/hemp, charas/hashish oil, bhang/siddhi/ganja и cannabis plant; sections 4 и 6 запрещают выращивание, владение, производство, продажу, покупку и перевозку, кроме разрешённых medical/scientific/industrial purposes, а sections 5 и 9 устанавливают строгие сроки лишения свободы. Pakistan Cannabis Control and Regulatory Authority Act 2024 дополнительно создаёт регулируемую medicinal/industrial cannabis-систему. Документы India MEA и Pakistan MOFA подтверждают противоположные позиции по Siachen, поэтому суверен не выбирается. Для KAS применяется явно обозначенный консервативный общий знаменатель всех визуально проверенных claimant-режимов: recreational запрещён, medical/scientific доступ ограничен разрешительным режимом, enforcement строгий. Это даёт жёлтый цвет и не означает признания чьего-либо суверенитета или равенства национальных программ доступа.",
    officialStatusPatch: {
      recreational: "ILLEGAL_OUTSIDE_AUTHORISED_SCOPE_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      medical: "LIMITED_OR_REGULATED_MEDICAL_SCIENTIFIC_ACCESS_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      enforcement: "STRICT_OUTSIDE_AUTHORISED_SCOPE_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
    },
    sources: [
      {
        title: "India Code - NDPS Act 1985, cannabis prohibition and medical/scientific exception",
        url: "https://www.indiacode.nic.in/bitstream/123456789/18974/1/narcotic-drugs-and-psychotropic-substances-act-1985.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-india-ndps-page11-11.png",
      },
      {
        title: "Pakistan Code - Control of Narcotic Substances Act 1997, consolidated cannabis prohibitions",
        url: "https://pakistancode.gov.pk/pdffiles/administrator739c7aa745c5afab5decf2e100caf1c5.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/PK/png/pages/PK-cnsa-1997-page-11.png",
      },
      {
        title: "Pakistan Code - Cannabis Control and Regulatory Authority Act 2024",
        url: "https://pakistancode.gov.pk/pdffiles/administrator135567794d629a6ce6f1b32daadc651d.pdf",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-pakistan-cannabis-act-2024-page01-01.png",
      },
      {
        title: "Ministry of Foreign Affairs Pakistan - Kashmir dispute and Siachen context",
        url: "https://mofa.gov.pk/storage/files/1/65451083a984b.pdf",
        role: "CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-pakistan-mofa-kashmir-dispute-page16-16.png",
      },
      {
        title: "Ministry of External Affairs India - Siachen and NJ 9842 context",
        url: "https://www.mea.gov.in/Uploads/PublicationDocs/23460_IWM_Book__11-06-2014_.pdf",
        role: "CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-39/KAS/screenshots/KAS-india-mea-siachen-context-page157-157.png",
      },
    ],
  },
  SPI: {
    reviewedAt: "2026-07-19T23:09:00.000Z",
    color: "LIMITED_OR_MEDICAL",
    method: "CONSERVATIVE_INTERSECTION_OF_ALL_VISUALLY_VERIFIED_CLAIMANT_REGIMES",
    reasonRu: "Свежая визуальная перепроверка закрывает SPI жёлтым без выбора стороны незавершённой границы. В аргентинской ветке действующая Ley 23.737 сохраняет наказание за владение, но официальный федеральный приговор 2025 года применяет Arriola и исключает наказание за частное личное владение без конкретного вреда третьим лицам; Ley 27.350 прямо создаёт регулируемый medical/scientific cannabis framework. В чилийской ветке действующая Ley 20.000 Article 8 прямо называет cannabis, наказывает неразрешённое выращивание, выделяет personal-use sanction scope и признаёт medical-treatment cultivation по рецепту врача; Decreto 404 отдельно запрещает операции с cannabis/resin/extracts/tinctures, сохраняя ISP-controlled research и human-use pharmaceutical scope. Chile Ministry of Foreign Affairs визуально подтверждает, что совместная картография Section B по Agreement 1998 ещё выполняется, поэтому суверен для всей SPI не выбирается. Консервативный общий знаменатель двух визуально проверенных claimant-режимов: рекреационный рынок не легализован, ограниченный/регулируемый медицинский путь существует, enforcement варьируется от мягкого personal-use carve-out до уголовного запрета. В трёхцветной модели это жёлтый; вывод не скрывает различия режимов и не признаёт суверенитет.",
    officialStatusPatch: {
      recreational: "ILLEGAL_OR_NOT_GENERALLY_LEGAL_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      medical: "LIMITED_OR_REGULATED_MEDICAL_ACCESS_UNDER_EVERY_VISUALLY_VERIFIED_CLAIMANT_REGIME",
      enforcement: "SOFT_OR_STRICT_DEPENDING_ON_CLAIMANT_AND_FACTS",
    },
    sources: [
      {
        title: "Argentina - updated Law 23,737 possession rule",
        url: "https://www.argentina.gob.ar/normativa/nacional/ley-23737-138/actualizacion",
        role: "CLAIMANT_NATIONAL_DRUG_LAW_WITH_CANNABIS_CASE_CONTEXT",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/AR-possession-penalty.png",
      },
      {
        title: "Argentina - updated Law 27,350 medical and scientific cannabis",
        url: "https://www.argentina.gob.ar/normativa/nacional/ley-27350-273801/actualizacion",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-30/SPI/screenshots/SPI-argentina-ley-27350-cannabis-law.png",
      },
      {
        title: "Argentina federal judiciary - 2025 Arriola application to private personal possession",
        url: "https://www.csjn.gov.ar/tribunales-federales-nacionales/d/sentencia-SGU-c6f9c533-7cd8-4163-83f2-2d1ee9733d14.pdf",
        role: "CLAIMANT_CURRENT_JUDICIAL_ENFORCEMENT_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/remaining-210/AR-2025-arriola-application.png",
      },
      {
        title: "Chile BCN LeyChile - Ley 20.000 Article 8 cannabis cultivation and medical prescription",
        url: "https://www.bcn.cl/leychile/navegar/imprimir?idNorma=235507&idParte=8652186",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-16/former-62-countries-batch2/CL-article-8.png",
      },
      {
        title: "Chile BCN LeyChile - Decreto 404 cannabis prohibition and pharmaceutical authorization",
        url: "https://www.bcn.cl/leychile/navegar?idNorma=13057",
        role: "CLAIMANT_DIRECT_CANNABIS_LAW",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/2026-07-18/remaining-30/SPI/screenshots/SPI-chile-leychile-decreto-404-cannabis-pharmaceuticals.png",
      },
      {
        title: "Chile Ministry of Foreign Affairs - Southern Patagonian Ice Field boundary work",
        url: "https://www.minrel.gob.cl/sala-de-prensa/comunicado-por-inventario-nacional-de-glaciares-de-argentina",
        role: "CLAIMANT_JURISDICTION_SCOPE",
        screenshotPath: "/Users/james/islegalcannabis_archive/cannabis-law-screenshots/grey-39-current/SPI-chile-foreign-ministry-boundary.png",
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
