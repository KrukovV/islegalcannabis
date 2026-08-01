#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REVIEWED_AT = "2026-07-20T09:24:56.000Z";
const TARGET_GEOS = ["BJN", "BRT", "SCR", "SER", "KAS", "SPI", "PGA"];
const REPORT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-project-null-7-fresh-visual-captures.json",
);
const VISUAL_LEDGER_PATH = path.join(
  ROOT,
  "data/official/cannabis_law_visual_reviews.audit.json",
);
const COLOR_REAUDIT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-grey-color-reaudit-39.json",
);

const reviewById = {
  "BJN-SER-icj-sovereignty": {
    titleRu: "ICJ — решение 2012 года о суверенитете Colombia над Bajo Nuevo и Serranilla",
    evidenceUse: "NEUTRAL_JURISDICTION_SCOPE",
    visualAnalysisRu:
      "На читаемом фрагменте пункта 251 Международный суд ООН единогласно фиксирует суверенитет Colombia над Bajo Nuevo и Serranilla. Это юрисдикционный мост, а не cannabis-law.",
  },
  "BJN-SER-colombia-medical-cannabis": {
    titleRu: "Colombia Ley 1787/2016 — медицинский и научный cannabis на всей национальной территории",
    evidenceUse: "DIRECT_CANNABIS_LAW_APPLIED_BY_JURISDICTION_BRIDGE",
    visualAnalysisRu:
      "На странице закона виден Article 1: национальный режим безопасного медицинского и научного использования cannabis и его производных действует на всей территории Colombia.",
  },
  "BJN-SER-colombia-personal-dose": {
    titleRu: "Colombia Corte Constitucional C-127/23 — отклонённый свежий захват",
    evidenceUse: "REJECTED_CAPTURE_NOT_PUBLISHED_AS_EVIDENCE",
    verdict: "REJECTED",
    visualAnalysisRu:
      "Headless-запрос вернул блокирующую/служебную оболочку без читаемого текста решения. Ссылка не засчитывается как свежо просмотренное доказательство; прежнее доказательство не удаляется.",
  },
  "BRT-un-ngo-unclaimed-context": {
    titleRu: "UN A/80/304 — NGO-вклад, называющий Bir Tawil unclaimed territory",
    evidenceUse: "NON_BINDING_NEGATIVE_CONTEXT",
    visualAnalysisRu:
      "На странице 10 формулировка unclaimed territory находится в разделе вкладов неправительственных организаций. Это полезное negative/context evidence, но не правовое решение ООН и не территориальный закон BRT.",
  },
  "BRT-un-los-egypt-boundary": {
    titleRu: "UN Law of the Sea Bulletin 94 — официальная пограничная позиция Egypt",
    evidenceUse: "CLAIMANT_OR_ACCESS_STATE_SCOPE",
    visualAnalysisRu:
      "На странице 25 видна позиция Egypt: международная граница проходит по 22-й параллели; территории севернее считаются египетскими. Документ объясняет пограничный контекст, но не создаёт закон Bir Tawil.",
  },
  "BRT-un-los-sudan-boundary": {
    titleRu: "UN Law of the Sea Bulletin 94 — официальная пограничная позиция Sudan",
    evidenceUse: "CLAIMANT_OR_ACCESS_STATE_SCOPE",
    visualAnalysisRu:
      "На странице 26 видна противоположная позиция Sudan по Hala'ib и унаследованной границе. Вместе с позицией Egypt она подтверждает отсутствие единого BRT-законодателя.",
  },
  "BRT-egypt-law-182-cannabis": {
    titleRu: "Egypt Law 182/1960 — Cannabis sativa в запрещённых к выращиванию растениях",
    evidenceUse: "ACCESS_STATE_DIRECT_CANNABIS_LAW_CONTEXT_ONLY_FOR_BRT",
    visualAnalysisRu:
      "На отрендеренной арабской странице 13 в таблице запрещённых к выращиванию растений читается القنب الهندي / Cannabis sativa. Это прямой закон Egypt, но не закон, изданный BRT.",
  },
  "BRT-egypt-current-amendments-index": {
    titleRu: "Egyptian Drug Authority — действующий индекс Law 182/1960 и поправок",
    evidenceUse: "ACCESS_STATE_CURRENT_LAW_INDEX",
    visualAnalysisRu:
      "На официальной странице EDA видна строка Law No. 182 of 1960 and its amendments с описанием anti-narcotics regulation. Индекс подтверждает актуальную нормативную ветку Egypt.",
  },
  "BRT-sudan-current-cannabis-enforcement": {
    titleRu: "Sudan Judiciary — актуальное применение закона 1994 года к hashish/Indian hemp",
    evidenceUse: "ACCESS_STATE_CURRENT_CANNABIS_ENFORCEMENT_CONTEXT_ONLY_FOR_BRT",
    visualAnalysisRu:
      "На официальной странице суда видны Indian hemp, THC и ссылка на Narcotic Drugs and Psychotropic Substances Act 1994; это реальное уголовное правоприменение Sudan, но не отдельная BRT-юрисдикция.",
  },
  "SCR-philippines-scope": {
    titleRu: "Philippines RA 9522 — Bajo de Masinloc / Scarborough Shoal в заявленной юрисдикции",
    evidenceUse: "CLAIMANT_JURISDICTION_SCOPE",
    visualAnalysisRu:
      "На читаемом Section 2 Bajo de Masinloc прямо назван Scarborough Shoal и отнесён к regime of islands под заявленной юрисдикцией Philippines.",
  },
  "SCR-PGA-philippines-ra9165": {
    titleRu: "Philippines RA 9165 — cannabis, marijuana и Indian hemp",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_LAW",
    visualAnalysisRu:
      "На официальной E-Library странице видна развернутая cannabis/marijuana/Indian hemp definition. Закон образует прямую claimant cannabis-law ветку для SCR и PGA.",
  },
  "SCR-china-scope": {
    titleRu: "China Embassy — официальная позиция по Huangyan Island",
    evidenceUse: "CLAIMANT_JURISDICTION_SCOPE",
    visualAnalysisRu:
      "На официальной странице посольства заголовок и текст прямо заявляют sovereignty China over Huangyan Island/Scarborough Shoal. Это claimant scope, а не нейтральное разрешение спора.",
  },
  "SCR-PGA-china-cannabis-law": {
    titleRu: "Supreme People's Court of China — Criminal Law, marijuana и narcotic offences",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_LAW",
    visualAnalysisRu:
      "На видимом фрагменте Articles 356–357 marijuana прямо включена в narcotic drugs; соседние нормы устанавливают уголовную ответственность за незаконные операции.",
  },
  "SCR-taiwan-scope": {
    titleRu: "Taiwan MOFA — официальная claimant-позиция по Scarborough Shoal",
    evidenceUse: "CLAIMANT_JURISDICTION_SCOPE",
    visualAnalysisRu:
      "На странице MOFA видны Scarborough Shoal/Huangyan Island и заявление, что South China Sea islands являются частью ROC (Taiwan) territory. Это явно маркированная claimant-позиция.",
  },
  "SCR-PGA-taiwan-cannabis-schedule": {
    titleRu: "Taiwan FDA — cannabis относится к Category II narcotic и незаконен",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_STATUS",
    visualAnalysisRu:
      "На официальной странице FDA читается, что cannabis и изделия относятся ко второй категории наркотиков, а изготовление, перевозка, продажа, ввоз, хранение и употребление незаконны.",
  },
  "KAS-india-ndps-cannabis": {
    titleRu: "India NDPS Act 1985 — определение cannabis (hemp)",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_LAW",
    visualAnalysisRu:
      "На странице 4 официального текста видны cannabis (hemp), charas, ganja и составные формы cannabis. Это cannabis-specific нормативный текст India.",
  },
  "KAS-india-medical-scientific-exception": {
    titleRu: "India NDPS Act 1985 — medical/scientific exception",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_LAW",
    visualAnalysisRu:
      "На странице 12 виден общий запрет операций с narcotic drugs и явное исключение для medical or scientific purposes; ниже отдельно упомянута cannabis plant/ganja.",
  },
  "KAS-pakistan-cnsa-cannabis": {
    titleRu: "Pakistan CNSA — определение cannabis, charas и ganja",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_LAW",
    visualAnalysisRu:
      "На странице 6 официального консолидированного акта видны cannabis (hemp), cannabis resin/charas, ganja и cannabis plant.",
  },
  "KAS-pakistan-ccra-2024": {
    titleRu: "Pakistan Cannabis Control and Regulatory Authority Act 2024",
    evidenceUse: "CLAIMANT_DIRECT_REGULATED_CANNABIS_LAW",
    visualAnalysisRu:
      "На странице 3 видны название закона, medicinal and industrial use, действие на весь Pakistan и подробное определение cannabis.",
  },
  "KAS-pakistan-ccra-amendment-2026": {
    titleRu: "Pakistan CCRA Amendment Act 2026",
    evidenceUse: "CLAIMANT_CURRENT_CANNABIS_LAW_AMENDMENT",
    visualAnalysisRu:
      "На первой странице Gazette of Pakistan читается Act XIX of 2026, президентское одобрение и прямое назначение: amend the Cannabis Control and Regulatory Authority Act, 2024.",
  },
  "KAS-pakistan-siachen-scope": {
    titleRu: "Pakistan MOFA — Siachen/Kashmir claimant context",
    evidenceUse: "CLAIMANT_JURISDICTION_SCOPE",
    visualAnalysisRu:
      "На официально опубликованной странице видны Siachen, ceasefire/LoC и Pakistan-side изложение Kashmir dispute. Это claimant context, не нейтральное решение суверенитета.",
  },
  "KAS-india-siachen-scope": {
    titleRu: "India MEA — Siachen и NJ 9842 claimant context",
    evidenceUse: "CLAIMANT_JURISDICTION_SCOPE",
    visualAnalysisRu:
      "На странице 157 публикации MEA видны Siachen, NJ 9842 и противоположные интерпретации India/Pakistan. Документ подтверждает спорный scope и запрещает выбирать одного суверена автоматически.",
  },
  "SPI-argentina-medical-cannabis": {
    titleRu: "Argentina Ley 27.350 — медицинский и научный cannabis",
    evidenceUse: "CLAIMANT_DIRECT_MEDICAL_CANNABIS_LAW",
    visualAnalysisRu:
      "На официальной актуализированной странице видны Ley 27350 и заголовок Uso medicinal de la planta de cannabis; Article 1 создаёт медицинский, терапевтический и научный framework.",
  },
  "SPI-argentina-current-personal-possession": {
    titleRu: "Argentina Federal Judiciary 2025 — personal possession и marijuana",
    evidenceUse: "CLAIMANT_CURRENT_JUDICIAL_ENFORCEMENT_SCOPE",
    visualAnalysisRu:
      "На подписанной странице решения видны tenencia para consumo personal, ссылка на Arriola и фактические 17 граммов marijuana. Это актуальная судебная enforcement-ветка, а не общий закон о легальном рынке.",
  },
  "SPI-chile-medical-cannabis-2023": {
    titleRu: "Chile Ley 21.575 — cultivation of cannabis for medical treatment",
    evidenceUse: "CLAIMANT_DIRECT_MEDICAL_CANNABIS_LAW",
    visualAnalysisRu:
      "На странице LeyChile читается норма, признающая оправданным выращивание cannabis для лечения при наличии врачебного рецепта с диагнозом, лечением и сроком.",
  },
  "SPI-chile-cannabis-control": {
    titleRu: "Chile Decreto 404 — cannabis prohibition и pharmaceutical authorization",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_LAW",
    visualAnalysisRu:
      "На Article 5 видны cannabis, resin, extracts и tinctures: операции запрещены, но возможны контролируемые research и human-use pharmaceutical authorizations.",
  },
  "SPI-chile-boundary-scope": {
    titleRu: "Chile Ministry of Foreign Affairs — Campo de Hielo Sur boundary scope",
    evidenceUse: "CLAIMANT_JURISDICTION_SCOPE",
    visualAnalysisRu:
      "Официальная страница подтверждает Agreement 1998 и незавершённую совместную картографию Section B. Поэтому общий SPI-суверен не выбирается.",
  },
  "PGA-un-six-claimants": {
    titleRu: "UN A/47/623 — шесть claimant-веток Spratly Islands",
    evidenceUse: "MULTI_CLAIMANT_JURISDICTION_SCOPE",
    visualAnalysisRu:
      "На странице 14 отчёта перечислены China, Taiwan, Viet Nam, Malaysia, Brunei Darussalam и Philippines, а ниже прямо сказано six parties concerned. Это нейтральный scope для проверки всех веток.",
  },
  "PGA-brunei-cannabis-law": {
    titleRu: "Brunei Misuse of Drugs Act Cap. 27 — cannabis definitions",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_LAW",
    visualAnalysisRu:
      "На странице закона видны определения cannabis, cannabis mixture и cannabis resin и связь controlled drugs с First Schedule.",
  },
  "PGA-malaysia-cannabis-definition": {
    titleRu: "Malaysia Dangerous Drugs Act 1952 — cannabis control structure",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_LAW",
    visualAnalysisRu:
      "На странице 4 содержания Act 234 виден отдельный Part III Control of prepared opium, cannabis and cannabis resin и Section 8 Application to cannabis.",
  },
  "PGA-malaysia-possession": {
    titleRu: "Malaysia Dangerous Drugs Act 1952 — possession of cannabis",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_LAW",
    visualAnalysisRu:
      "На странице 13 Section 6 запрещает possession/custody/control cannabis без authorization и устанавливает уголовную ответственность.",
  },
  "PGA-philippines-current-cannabis-judgment": {
    titleRu: "Philippines Supreme Court 2025 — отклонённый свежий захват",
    evidenceUse: "REJECTED_CAPTURE_NOT_PUBLISHED_AS_EVIDENCE",
    verdict: "REJECTED",
    visualAnalysisRu:
      "Изолированный Chromium получил CloudFront 403 вместо текста решения. Кадр честно сохранён как отказ доступа, но не засчитывается как cannabis-law evidence; RA 9165 остаётся читаемым официальным доказательством Philippines.",
  },
  "PGA-vietnam-decree-28-2026": {
    titleRu: "Vietnam Decree 28/2026 — List I cannabis plant and preparations",
    evidenceUse: "CLAIMANT_CURRENT_DIRECT_CANNABIS_SCHEDULE",
    visualAnalysisRu:
      "На странице 2 приложения List I в строках 9–10 читаются Cây cần sa и Cannabis preparations containing THC. Заголовок определяет список как запрещённый для медицинского и социального использования вне специального режима.",
  },
  "PGA-vietnam-law-73-2021": {
    titleRu: "Vietnam Law 73/2021 — cannabis plant в Drug Prevention and Control Law",
    evidenceUse: "CLAIMANT_DIRECT_CANNABIS_LAW",
    visualAnalysisRu:
      "На первой странице закона виден официальный заголовок; в Article 2(6) cannabis plant (cây cần sa) прямо включена в narcotic-containing plants.",
  },
};

const perGeoAnalytics = {
  BJN: {
    officialLawColor: "LEGAL_OR_DECRIMINALIZED",
    officialLawColorRu: "зелёный",
    currentMapColor: "UNKNOWN",
    analysisRu:
      "ICJ даёт нейтральный мост к юрисдикции Colombia; Ley 1787 действует на всей национальной территории и создаёт medical/scientific cannabis framework. Текущий цвет карты остаётся серым, потому что projectStatus отсутствует; официальный вывод остаётся зелёным и не подменяет карту.",
  },
  SER: {
    officialLawColor: "LEGAL_OR_DECRIMINALIZED",
    officialLawColorRu: "зелёный",
    currentMapColor: "UNKNOWN",
    analysisRu:
      "ICJ даёт нейтральный мост к юрисдикции Colombia; Ley 1787 действует на всей национальной территории и создаёт medical/scientific cannabis framework. Текущий цвет карты остаётся серым, потому что projectStatus отсутствует; официальный вывод остаётся зелёным и не подменяет карту.",
  },
  BRT: {
    officialLawColor: "LIMITED_OR_MEDICAL",
    officialLawColorRu: "жёлтый",
    currentMapColor: "UNKNOWN",
    analysisRu:
      "Публичного BRT-законодателя нет. UN-hosted NGO context не является обязательным правом; позиции Egypt и Sudan несовместимы. Для operational-access fallback обе государственные cannabis-law ветки просмотрены и дают только ограниченные разрешительные medical/scientific режимы при строгом запрете остального. Карта — серая, официальный аналитический fallback — жёлтый.",
  },
  SCR: {
    officialLawColor: "ILLEGAL",
    officialLawColorRu: "красный",
    currentMapColor: "UNKNOWN",
    analysisRu:
      "Philippines, China и Taiwan claimant-ветки визуально проверены: каждая запрещает recreational cannabis. Суверен не выбирается; совпадающий минимальный вывод — красный. Карта остаётся серой из-за отсутствующего projectStatus.",
  },
  KAS: {
    officialLawColor: "LIMITED_OR_MEDICAL",
    officialLawColorRu: "жёлтый",
    currentMapColor: "UNKNOWN",
    analysisRu:
      "India и Pakistan claimant-ветки обе запрещают recreational cannabis, но сохраняют medical/scientific либо medicinal/industrial authorization. Siachen scope остаётся спорным. Общий официальный вывод — жёлтый; текущая карта — серая.",
  },
  SPI: {
    officialLawColor: "LIMITED_OR_MEDICAL",
    officialLawColorRu: "жёлтый",
    currentMapColor: "UNKNOWN",
    analysisRu:
      "Argentina и Chile обе имеют регулируемые medical cannabis ветки, но не общий legal recreational market; enforcement различается. Незавершённая Section B не позволяет выбрать суверена. Официальный общий вывод — жёлтый, карта — серая.",
  },
  PGA: {
    officialLawColor: "ILLEGAL",
    officialLawColorRu: "красный",
    currentMapColor: "UNKNOWN",
    analysisRu:
      "Проверены все шесть claimant-веток из UN A/47/623: Brunei, China, Malaysia, Philippines, Taiwan и Vietnam. Общего patient-access режима нет, recreational cannabis запрещён во всех ветках. Официальный общий вывод — красный; карта остаётся серой.",
  },
};

const normalizeUrl = (value) => {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(value || "").replace(/#.*$/, "");
  }
};
const unique = (values) => [...new Set(values.filter(Boolean))];
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJson = (filePath, value) =>
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);

const report = readJson(REPORT_PATH);
const reportIds = new Set(report.rows.map((row) => row.id));
for (const id of Object.keys(reviewById)) {
  if (!reportIds.has(id)) throw new Error(`VISUAL_REVIEW_WITHOUT_CAPTURE id=${id}`);
}
for (const row of report.rows) {
  const review = reviewById[row.id];
  if (!review) throw new Error(`CAPTURE_WITHOUT_VISUAL_REVIEW id=${row.id}`);
  if (!row.screenshotPath || !fs.existsSync(row.screenshotPath)) {
    throw new Error(`SCREENSHOT_MISSING id=${row.id} path=${row.screenshotPath || "null"}`);
  }
  Object.assign(row, {
    humanVisualVerdict: review.verdict || "ACCEPTED",
    humanVisualReviewedAt: REVIEWED_AT,
    evidenceUse: review.evidenceUse,
    titleRu: review.titleRu,
    visualAnalysisRu: review.visualAnalysisRu,
  });
}

const acceptedRows = report.rows.filter((row) => row.humanVisualVerdict === "ACCEPTED");
const rejectedRows = report.rows.filter((row) => row.humanVisualVerdict === "REJECTED");
if (acceptedRows.length !== 32 || rejectedRows.length !== 2) {
  throw new Error(`VISUAL_VERDICT_COUNTS_INVALID accepted=${acceptedRows.length} rejected=${rejectedRows.length}`);
}
for (const geo of TARGET_GEOS) {
  if (!acceptedRows.some((row) => row.geos.includes(geo))) {
    throw new Error(`GEO_WITHOUT_ACCEPTED_FRESH_VISUAL_EVIDENCE geo=${geo}`);
  }
}

report.humanVisualReviewedAt = REVIEWED_AT;
report.humanVisualAcceptedCount = acceptedRows.length;
report.humanVisualRejectedCount = rejectedRows.length;
report.perGeoAnalytics = perGeoAnalytics;
writeJson(REPORT_PATH, report);

const toLedgerSource = (capture) => ({
  title: capture.titleRu,
  url: capture.url,
  source_kind: capture.role,
  screenshot_path: capture.screenshotPath,
  fresh_visual_review: "FRESH_HUMAN_VISUAL_ACCEPTANCE_2026_07_20",
  fresh_visual_analysis_ru: capture.visualAnalysisRu,
});

function mergeLedgerSource(sources, capture) {
  const normalized = normalizeUrl(capture.url);
  const existing = sources.find((source) => normalizeUrl(source.url) === normalized);
  if (!existing) {
    sources.push(toLedgerSource(capture));
    return;
  }
  existing.fresh_visual_review = "FRESH_HUMAN_VISUAL_ACCEPTANCE_2026_07_20";
  existing.fresh_visual_analysis_ru = capture.visualAnalysisRu;
  existing.fresh_screenshot_paths = unique([
    ...(existing.fresh_screenshot_paths || []),
    capture.screenshotPath,
  ]);
}

const visualLedger = readJson(VISUAL_LEDGER_PATH);
for (const geo of TARGET_GEOS) {
  const ledgerRow = visualLedger.rows.find((row) => row.geo === geo);
  if (!ledgerRow) throw new Error(`VISUAL_LEDGER_GEO_MISSING geo=${geo}`);
  const acceptedForGeo = acceptedRows.filter((row) => row.geos.includes(geo));
  const rejectedForGeo = rejectedRows.filter((row) => row.geos.includes(geo));
  ledgerRow.screenshot_paths = unique([
    ...(ledgerRow.screenshot_paths || []),
    ...acceptedForGeo.map((row) => row.screenshotPath),
  ]);
  ledgerRow.verified_sources ||= [];
  ledgerRow.verified_context_sources ||= [];
  for (const capture of acceptedForGeo) {
    const isDirectTerritorialChain =
      (geo === "BJN" || geo === "SER") &&
      capture.id === "BJN-SER-colombia-medical-cannabis";
    mergeLedgerSource(
      isDirectTerritorialChain
        ? ledgerRow.verified_sources
        : ledgerRow.verified_context_sources,
      capture,
    );
  }
  ledgerRow.fresh_project_null_7_reaudit = {
    reviewed_at: REVIEWED_AT,
    visual_verdict: "HUMAN_VISUALLY_ACCEPTED_WITH_STATED_SCOPE",
    captured_count: acceptedForGeo.length + rejectedForGeo.length,
    accepted_count: acceptedForGeo.length,
    rejected_capture_ids: rejectedForGeo.map((row) => row.id),
    current_map_color: "UNKNOWN",
    official_law_color: perGeoAnalytics[geo].officialLawColor,
    analysis_ru: perGeoAnalytics[geo].analysisRu,
    accepted_screenshot_paths: acceptedForGeo.map((row) => row.screenshotPath),
  };
}
visualLedger.reviewed_at = REVIEWED_AT;
writeJson(VISUAL_LEDGER_PATH, visualLedger);

function mergeColorSource(sources, capture) {
  const normalized = normalizeUrl(capture.url);
  const existing = sources.find((source) => normalizeUrl(source.url) === normalized);
  if (!existing) {
    sources.push({
      title: capture.titleRu,
      url: capture.url,
      role: capture.role,
      visualReview: "FRESH_HUMAN_VISUAL_ACCEPTANCE_2026_07_20",
      screenshotPath: capture.screenshotPath,
      freshVisualAnalysisRu: capture.visualAnalysisRu,
    });
    return;
  }
  existing.visualReview = "FRESH_HUMAN_VISUAL_ACCEPTANCE_2026_07_20";
  existing.freshVisualAnalysisRu = capture.visualAnalysisRu;
  existing.freshScreenshotPaths = unique([
    ...(existing.freshScreenshotPaths || []),
    capture.screenshotPath,
  ]);
}

const colorReaudit = readJson(COLOR_REAUDIT_PATH);
for (const geo of TARGET_GEOS) {
  const colorRow = colorReaudit.rows.find((row) => row.geo === geo);
  if (!colorRow) throw new Error(`COLOR_REAUDIT_GEO_MISSING geo=${geo}`);
  const acceptedForGeo = acceptedRows.filter((row) => row.geos.includes(geo));
  colorRow.freshOfficialSources ||= [];
  for (const capture of acceptedForGeo) {
    mergeColorSource(colorRow.freshOfficialSources, capture);
  }
  colorRow.freshProjectNull7Reaudit = {
    reviewedAt: REVIEWED_AT,
    currentMapColor: "UNKNOWN",
    officialLawColor: perGeoAnalytics[geo].officialLawColor,
    acceptedScreenshotPaths: acceptedForGeo.map((row) => row.screenshotPath),
    analysisRu: perGeoAnalytics[geo].analysisRu,
  };
}
colorReaudit.reviewedAt = REVIEWED_AT;
writeJson(COLOR_REAUDIT_PATH, colorReaudit);

console.log(`PROJECT_NULL_7_VISUAL_ACCEPTED=${acceptedRows.length}`);
console.log(`PROJECT_NULL_7_VISUAL_REJECTED=${rejectedRows.length}`);
console.log(`PROJECT_NULL_7_GEOS=${TARGET_GEOS.length}`);
console.log(`STATUS_SSOT_MUTATED=0`);
