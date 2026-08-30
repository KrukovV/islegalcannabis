#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const OUT_JSON_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-primary-law-blockers.json",
);
const OUT_MD_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-primary-law-blockers.md",
);
const COLLECTOR_INDEX_PATH = path.join(
  ROOT,
  "data/reviews/direct-cannabis-law-pages_v33_official/index.json",
);
const MATRIX_307_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-cannabis-law-matrix-307.json",
);
const TRUTH_REPORT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-307-truth-audit-report.json",
);

const { evaluatePrimaryLaw } = await import(path.join(
  ROOT,
  "tools",
  "wiki",
  "build_wiki_truth_307_acceptance_audit.mjs",
));

const CLD_DATA_URL =
  "https://www.unodc.org/cld/pt/v3/drugcontrolrepository/enl/data.json";
const ERITREA_COUNTRY_FILTER = {
  fieldName: "en#legislation.legislationDocument@country_label_s",
  value: "Eritrea",
};
const CANNABIS_TERMS = [
  "cannabis",
  "hashish",
  "marijuana",
  "marihuana",
  "hemp",
  "Indian hemp",
];
const ER_FRESH_TARGETED_SEARCH_AUDIT = Object.freeze({
  source: "Codex live web search",
  executedAt: "2026-07-26",
  result: "DIRECT_CANNABIS_FAMILY_PRIMARY_LAW_FOUND_SCOPE_LIMITED",
  searchRound: "EXPANDED_MULTILINGUAL_GAZETTE_AND_HEALTH_LEGISLATION_SEARCH",
  officialSourceStandard:
    "Act, Statute, Gazette, Parliament, Ministry, Regulator, Court, or official primary-law repository copy.",
  queries: [
    {
      query: "Eritrea Drug Offences Regulations Article 376 cannabis controlled plant official",
      outcome:
        "Search surfaced the FAOLEX Penal Code PDF and secondary cannabis-law pages; no official Drug Offences Regulations list naming cannabis/hashish/hemp was found.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "Eritrea Penal Code Article 376 Drug Offences Regulations cannabis hashish",
      outcome:
        "Search surfaced the FAOLEX Penal Code PDF and Wikipedia/secondary pages; no official Eritrea cannabis schedule or regulation text was found.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "site:unodc.org Eritrea cannabis Drug Offences Regulations Article 376",
      outcome:
        "Search returned UNODC drug-report material and the known CLD Penal Code context, but no Eritrea-filtered cannabis regulation/schedule.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "site:faolex.fao.org Eritrea cannabis narcotic drugs Penal Code Article 376",
      outcome:
        "Search returned the FAOLEX Penal Code copy; the PDF text search did not find cannabis/hashish/hemp terminology.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "\"Drug Offences Regulations\" \"Eritrea\"",
      outcome:
        "Search returned the Penal Code phrase stating that definitions shall be in Drug Offences Regulations; it did not locate the regulations themselves.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "\"Controlled Plant\" \"Drug Offences Regulations\" \"Eritrea\"",
      outcome:
        "Search returned Penal Code context only; no official controlled-plant list naming cannabis/hashish/hemp was found.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "Eritrea Drug Offences Regulations cannabis hashish hemp controlled plant schedule",
      outcome:
        "Expanded search surfaced the FAOLEX Penal Code PDF, secondary cannabis-law pages, and unrelated FAOLEX/INCB materials; no official Eritrea schedule or Drug Offences Regulations text naming cannabis/hashish/hemp was found.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "Eritrea Gazette Drug Offences Regulations Article 376 cannabis",
      outcome:
        "Search did not locate a Gazette of Eritrean Laws item for Drug Offences Regulations or a cannabis/hashish/hemp controlled list; visible results remained Penal Code context or secondary summaries.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "site:faolex.fao.org Eritrea Drug Regulations cannabis Controlled Drugs",
      outcome:
        "FAOLEX-targeted search returned the Penal Code copy and unrelated Eritrea regulations, but no cannabis-specific Eritrea drug schedule/regulation.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "site:shabait.com Eritrea cannabis law drug offences regulations",
      outcome:
        "Government Ministry of Information search found legal-system and Ministry of Justice public-awareness pages about the 2015 codes, but no cannabis/hashish/hemp schedule or Drug Offences Regulations text.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "site:moj.gov.er Eritrea Drug Offences Regulations cannabis",
      outcome:
        "No accessible Ministry of Justice result was found for a cannabis-specific Drug Offences Regulations text.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "site:ilo.org/dyn/natlex Eritrea Drug Offences Regulations cannabis",
      outcome:
        "ILO/NATLEX-targeted search did not surface an Eritrea cannabis-specific regulation or schedule; unrelated country criminal-code PDFs appeared.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: "Eritrea cannabis Penal Code official PDF",
      outcome:
        "Search surfaced a systematic-review citation to the Penal Code and multiple secondary claims, but no official law text naming cannabis in Eritrea.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: '"Gazette of Eritrean Laws" "Drug Offences"',
      outcome:
        "Search located Library of Congress Gazette of Eritrean Laws collection context, but no indexed Drug Offences Regulations item or cannabis/hashish/hemp schedule was found.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: '"Gazette of Eritrean Laws" cannabis Eritrea',
      outcome:
        "Gazette-targeted search did not locate a visible Eritrea Gazette text naming cannabis, hashish, marijuana, marihuana, hemp, or Indian hemp.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: '"Eritrean Gazette" "controlled drugs"',
      outcome:
        "Search did not surface an Eritrea controlled-drugs schedule or Drug Offences Regulations text with cannabis-family terms.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: '"إريتريا" "الحشيش" "قانون" "المخدرات"',
      outcome:
        "Arabic-language search found no official Eritrea Act, Gazette, Ministry, Regulator, Court, or Parliament text naming hashish/cannabis in a controlled-drug schedule.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query: 'site:shabait.com "ሓሺሽ" "ኤርትራ"',
      outcome:
        "Tigrinya government-media search surfaced hashish-trader wording in a Red Sea geopolitics context, not an applicable Eritrea law, regulation, schedule, or court/parliament source.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query:
        '"Proclamation No 36/1993" Eritrea drugs medical supplies sanitary items cannabis',
      outcome:
        "WHO CPCD surfaced a 40-page Eritrea primary-law candidate PDF for control of drugs, medical supplies, and sanitary items; local text extraction was unusable, so the document cannot be counted as cannabis-specific primary-law proof without OCR/visual review.",
      directCannabisPrimaryLawFound: false,
    },
    {
      query:
        'LOC Foreign Legal Gazettes Eritrea hemp marihuana hashish Custom Tariff Regulations 18/1994',
      outcome:
        "LOC Gazette collection search and direct PDF review found Custom Tariff Regulations 18/1994, Third Schedule - Prohibited Goods, item 6, visibly listing Marihuana and hashish with other narcotics. This is direct cannabis-family primary-law evidence for customs/import prohibited-goods scope, not patient access or a Drug Offences Regulations schedule.",
      directCannabisPrimaryLawFound: true,
    },
  ],
  officialSourcesReviewed: [
    {
      title: "Penal Code of the State of Eritrea",
      url: "https://faolex.fao.org/docs/pdf/eri210565.pdf",
      finding:
        "Primary-law repository copy proves Book V drug offences and Article 376 delegation to Drug Offences Regulations; visible PDF text does not name cannabis/hashish/hemp.",
      directCannabisPrimaryLawFound: false,
    },
    {
      title: "UNODC CLD Eritrea Penal Code Book V entries",
      url: "https://www.unodc.org/cld/pt/v3/drugcontrolrepository/enl/search.html",
      finding:
        "Country-filtered CLD search proves Eritrea Penal Code Book V entries, while Eritrea-filtered cannabis/hashish/marijuana/marihuana/hemp/Indian hemp searches remain zero.",
      directCannabisPrimaryLawFound: false,
    },
    {
      title: "Eritrea Ministry of Information - Public Awareness for a Refined Legal System",
      url: "https://shabait.com/2017/02/15/public-awareness-for-a-refined-legal-system/",
      finding:
        "Government page corroborates the 2015 legal-code reform and Ministry of Justice public-awareness context, but it does not publish Drug Offences Regulations or name cannabis/hashish/hemp.",
      directCannabisPrimaryLawFound: false,
    },
    {
      title: "Eritrea Ministry of Information - Law and Nation Building: MoJ's Law Week",
      url: "https://shabait.com/2021/12/16/law-and-nation-building-mojs-law-week/",
      finding:
        "Government page corroborates Ministry of Justice legal-awareness activity and implementation-of-2015-codes context, but it does not provide a cannabis-specific controlled-drug/plant source.",
      directCannabisPrimaryLawFound: false,
    },
    {
      title:
        "Library of Congress - Digital Collection of the Gazette of Eritrean Laws Goes Live",
      url: "https://blogs.loc.gov/law/2020/09/digital-collection-of-the-gazette-of-eritrean-laws-goes-live/",
      finding:
        "Law-library repository context proves a Gazette of Eritrean Laws collection pathway for Eritrea primary law through 2017, but targeted search did not locate the Drug Offences Regulations or a cannabis/hashish/hemp schedule.",
      directCannabisPrimaryLawFound: false,
    },
    {
      title:
        "WHO CPCD - Proclamation No. 36/1993 to control drugs, medical supplies and sanitary items",
      url: "https://extranet.who.int/cpcd/health-legislation/proclamation-no-361993-control-drugs-medical-supplies-and-sanitary-items",
      finding:
        "Health-legislation repository page identifies a 40-page Eritrea proclamation candidate and PDF download; the page itself does not name cannabis/hashish/hemp.",
      directCannabisPrimaryLawFound: false,
    },
    {
      title:
        "WHO CPCD PDF - ERI_Eritrea_Proclamation-No-36-1993-control-drugs-medical-supplies_1993.pdf",
      url: "https://extranet.who.int/cpcd/sites/default/files/public_file_repository/ERI_Eritrea_Proclamation-No-36-1993-control-drugs-medical-supplies_1993.pdf",
      finding:
        "Primary-law candidate PDF exists. Local pdftotext extraction was unusable (40 bytes for 40 pages); a follow-up Tigrinya/Amharic OCR pass produced 91,665 bytes but found no cannabis-family term. This strengthens negative evidence but still does not prove the missing Drug Offences Regulations/schedule bridge.",
      directCannabisPrimaryLawFound: false,
    },
    {
      title:
        "Eritrea Ministry of Information - Tigrinya Red Sea geopolitics context",
      url: "https://shabait.com/2024/01/03/%E1%89%80%E1%8B%AD%E1%88%95-%E1%89%A3%E1%88%95%E1%88%AA%E1%8A%95-%E1%8C%82%E1%8A%A6-%E1%8D%96%E1%88%88%E1%89%B2%E1%8A%AB%E1%8A%A1%E1%8A%95/",
      finding:
        "Official government-media context includes hashish-trader wording, but it is geopolitical/security context, not applicable Eritrea primary law or a controlled-substance schedule.",
      directCannabisPrimaryLawFound: false,
    },
    {
      title: "Custom Tariff Regulations 18/1994",
      url: "https://tile.loc.gov/storage-services/service/ll/lleritrea/eritrean-notice-18-1994/eritrean-notice-18-1994.pdf",
      finding:
        "LOC Gazette of Eritrean Laws primary-law copy, page 30, Third Schedule - Prohibited Goods, item 6, visibly lists Marihuana and hashish with cocaine, opium, heroin, morphine, LSD, chat, and all other narcotics. Legal use is limited to customs/import prohibited-goods scope and cannot be mixed into patient access, adult-use, or the missing Penal Code Article 376 Drug Offences Regulations schedule.",
      directCannabisPrimaryLawFound: true,
    },
  ],
  candidatePrimaryLawDocumentsNeedingOcr: [
    {
      title:
        "Proclamation No. 36/1993 to control drugs, medical supplies and sanitary items",
      sourcePageUrl:
        "https://extranet.who.int/cpcd/health-legislation/proclamation-no-361993-control-drugs-medical-supplies-and-sanitary-items",
      pdfUrl:
        "https://extranet.who.int/cpcd/sites/default/files/public_file_repository/ERI_Eritrea_Proclamation-No-36-1993-control-drugs-medical-supplies_1993.pdf",
      repository: "WHO CPCD health legislation",
      pages: 40,
      localTextExtraction: {
        command:
          "curl -L <pdfUrl> -o /tmp/eritrean-proclamation-36-1993.pdf && pdftotext /tmp/eritrean-proclamation-36-1993.pdf -",
        result: "TEXT_EXTRACTION_UNUSABLE",
        extractedBytes: 40,
        matchedTerms: [],
      },
      ocrAudit: {
        artifactPath:
          "data/reviews/wiki-truth-307-er-proclamation-36-1993-ocr-audit.json",
        textArtifactPath:
          "data/reviews/wiki-truth-307-er-proclamation-36-1993-ocr-tir-amh.txt",
        command:
          "pdftoppm -r 300 -png <pdf> <pages> && tesseract <page> stdout --tessdata-dir <tmp-tessdata> -l tir+amh --psm 6",
        result: "OCR_COMPLETED_NO_CANNABIS_FAMILY_MATCHES",
        languages: ["tir", "amh"],
        renderedPages: 40,
        extractedBytes: 91665,
        matchedTerms: [],
        termsTested: [
          "cannabis",
          "hashish",
          "marijuana",
          "marihuana",
          "hemp",
          "ganja",
          "bhang",
          "charas",
          "tetrahydrocannabinol",
          "THC",
          "Tigrinya/Amharic hashish variants",
          "Tigrinya/Amharic cannabis variants",
          "Tigrinya/Amharic marijuana variants",
          "Tigrinya/Amharic hemp variants",
        ],
      },
      legalEffectForTruthFirstAudit:
        "OCR_NEGATIVE_CANDIDATE_ONLY_NOT_CANNABIS_PROOF",
      requiredClosureStep:
        "A visible official Drug Offences Regulations list, Gazette schedule, Ministry/Regulator page, Act, Statute, Court, or Parliament source naming cannabis/hashish/hemp as a controlled drug or controlled plant.",
    },
  ],
  secondaryClaimsRejected: [
    {
      sourceType: "Wikipedia and cannabis-law summary pages",
      reason:
        "They may say Eritrea cannabis is illegal, but they are not Act/Statute/Gazette/Ministry/Regulator/Court primary law and cannot close the Truth-first primary-law blocker.",
    },
    {
      sourceType: "Systematic review / academic citation",
      reason:
        "It cites the Penal Code and Article 395-type possession framework, but it does not provide the missing Eritrea Drug Offences Regulations list naming cannabis/hashish/hemp.",
    },
  ],
  conclusion:
    "Expanded multilingual Gazette and health-legislation search closes the narrow 'no direct cannabis-family primary law at all' blocker: LOC Custom Tariff Regulations 18/1994 visibly names Marihuana and hashish as prohibited goods/narcotics. The generic Penal Code drug framework, 2015-code context, Gazette collection pathway, and WHO-hosted 1993 drug-control proclamation candidate remain supporting context. The Penal Code Article 376 Drug Offences Regulations schedule is still not located, and the LOC customs source must not be mixed into patient access or adult-use. In the Truth-first layer ER can be reviewed as RED because direct cannabis-family primary law proves prohibited narcotics/import context and no operational patient access/adult-use source is proven.",
});

function cldUrl(criteria) {
  const url = new URL(CLD_DATA_URL);
  url.searchParams.set("lng", "en");
  url.searchParams.set("criteria", JSON.stringify(criteria));
  return url.toString();
}

async function fetchCld(criteria) {
  const url = cldUrl(criteria);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "isLegal-local-truth-audit/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`UNODC_CLD_HTTP_${response.status}`);
    }
    const json = await response.json();
    return {
      url,
      found: Number(json.found || 0),
      results: (Array.isArray(json.results) ? json.results : []).map((result) => ({
        uri: result.uri || "",
        country: result.values?.["en#legislation.legislationDocument@country_label_s1"] || "",
        title:
          result.values?.["legislation.legislationDocument.nationalLawArticle@title_s1"] ||
          "",
        chapter:
          result.values?.[
            "legislation.legislationDocument.nationalLawArticle@chapterDescription_s1"
          ] || "",
        article:
          result.values?.["legislation.legislationDocument.nationalLawArticle@article_s1"] ||
          "",
      })),
      networkStatus: "HTTP_OK",
      networkDiagnostic: "",
    };
  } catch (error) {
    return {
      url,
      found: null,
      results: [],
      networkStatus: "SOURCE_ACCESS_BLOCKED",
      networkDiagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}

function mdCell(value, limit = 260) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const trimmed = text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
  return trimmed.replace(/\|/g, "\\|");
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findGeoRow(value, geo) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGeoRow(item, geo);
      if (found) return found;
    }
    return null;
  }
  if (String(value.geo || value.code || value.iso2 || "") === geo) {
    return value;
  }
  for (const item of Object.values(value)) {
    const found = findGeoRow(item, geo);
    if (found) return found;
  }
  return null;
}

function buildLocalCollectorAudit(geo) {
  const payload = readJsonIfExists(COLLECTOR_INDEX_PATH);
  const row = findGeoRow(payload, geo) || {};
  const candidatePages = Array.isArray(row.candidate_pages)
    ? row.candidate_pages
    : [];
  return {
    source: "direct-cannabis-law-pages_v33_official",
    path: path.relative(ROOT, COLLECTOR_INDEX_PATH),
    selectedCandidates: Number(row.selected_candidates || 0),
    fetchedCandidates: Number(row.fetched_candidates || 0),
    hasCannabisPages: row.has_cannabis_pages === true,
    candidateSample: candidatePages.slice(0, 8).map((candidate) => ({
      idx: Number(candidate.idx || 0),
      url: String(candidate.url || ""),
      sourceKind: String(candidate.source_kind || ""),
      candidateKind: String(candidate.candidate_kind || ""),
      fetchedOk: candidate.fetched?.ok === true,
      fetchedStatus: Number(candidate.fetched?.status || 0),
      hasCannabis: candidate.derived?.hasCannabis === true,
      confidence: String(candidate.derived?.confidence || ""),
    })),
    conclusion:
      "The saved official-only v33 collector row for ER selected 198 candidates and fetched 25, but did not derive any cannabis-specific official page. This is negative discovery evidence only and must not be converted into a cannabis-law conclusion.",
  };
}

function buildVisualReviewEvidence(geo) {
  const payload = readJsonIfExists(MATRIX_307_PATH);
  const row = findGeoRow(payload, geo) || {};
  return {
    source: "wiki-truth-cannabis-law-matrix-307",
    path: path.relative(ROOT, MATRIX_307_PATH),
    sourceCoverage: String(row.sourceCoverage || ""),
    differenceStatus: String(row.differenceStatus || ""),
    visualReviewStatus: String(row.visualReviewStatus || ""),
    screenshotPaths: Array.isArray(row.screenshotPaths)
      ? row.screenshotPaths.map((item) => String(item || "")).filter(Boolean)
      : [],
    officialContextLinks: Array.isArray(row.officialContextLinks)
      ? row.officialContextLinks.map((item) => ({
          title: String(item.title || ""),
          url: String(item.url || ""),
          sourceKind: String(item.sourceKind || ""),
          evidenceScope: String(item.evidenceScope || ""),
          verification: String(item.verification || ""),
          visualReview: String(item.visualReview || ""),
          screenshotPath: String(item.screenshotPath || ""),
        }))
      : [],
    conclusion:
      "The saved matrix row supplies retained official-link and visual-review metadata only. Its acceptance status is evaluated from the current canonical Truth report and matrix without creating a legal conclusion.",
  };
}

function buildMarkdown(output) {
  const lines = [];
  lines.push("# Wiki Truth 307 Primary-Law Blockers");
  lines.push("");
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Non-mutating: ${output.nonMutating ? "TRUE" : "FALSE"}`);
  lines.push(`Blockers: ${output.blockersTotal}`);
  lines.push("");
  lines.push("## Blockers");
  lines.push("");
  lines.push("| GEO | Territory | Status | Evidence summary | Required next evidence |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const blocker of output.blockers) {
    lines.push(
      `| ${mdCell(blocker.geo)} | ${mdCell(blocker.territory)} | ${mdCell(blocker.status)} | ${mdCell(blocker.evidenceSummary)} | ${mdCell(blocker.requiredNextEvidence)} |`,
    );
  }
  if (!output.blockers.length) {
    lines.push("| - | - | NONE | No unresolved primary-law blockers remain in this artifact. | - |");
  }
  if (Array.isArray(output.resolvedPrimaryLawEvidence) && output.resolvedPrimaryLawEvidence.length) {
    lines.push("");
    lines.push("## Resolved Primary-Law Evidence");
    lines.push("");
    lines.push("| GEO | Territory | Status | Truth color | Evidence summary | Scope limit |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const resolved of output.resolvedPrimaryLawEvidence) {
      lines.push(
        `| ${mdCell(resolved.geo)} | ${mdCell(resolved.territory)} | ${mdCell(resolved.status)} | ${mdCell(resolved.proposedTruthColor)} | ${mdCell(resolved.evidenceSummary)} | ${mdCell(resolved.scopeLimit)} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Eritrea CLD Search Results");
  lines.push("");
  const er = [
    ...output.blockers,
    ...(Array.isArray(output.resolvedPrimaryLawEvidence)
      ? output.resolvedPrimaryLawEvidence
      : []),
  ].find((blocker) => blocker.geo === "ER");
  if (er) {
    lines.push(
      `Country-filtered documents: ${er.officialContextSearch.found ?? "UNCONFIRMED"} (${er.officialContextSearch.networkStatus || "UNCONFIRMED"})`,
    );
    for (const result of er.officialContextSearch.results) {
      lines.push(
        `- ${result.title || result.uri}; chapter=${result.chapter || "-"}; article=${result.article || "-"}; uri=${result.uri}`,
      );
    }
    lines.push("");
    lines.push("| Term | Country-filtered CLD results | Retrieval state |");
    lines.push("| --- | --- | --- |");
    for (const search of er.negativeSearches) {
      lines.push(
        `| ${mdCell(search.term)} | ${search.found ?? "UNCONFIRMED"} | ${search.networkStatus || "UNCONFIRMED"} |`,
      );
    }
    lines.push("");
    lines.push("## Eritrea Local Collector / Visual Evidence");
    lines.push("");
    lines.push(
      `Collector: ${er.localCollectorAudit.source}; selected=${er.localCollectorAudit.selectedCandidates}; fetched=${er.localCollectorAudit.fetchedCandidates}; has cannabis pages=${er.localCollectorAudit.hasCannabisPages ? "TRUE" : "FALSE"}`,
    );
    lines.push(`Collector path: ${er.localCollectorAudit.path}`);
    lines.push(`Collector conclusion: ${er.localCollectorAudit.conclusion}`);
    lines.push("");
    lines.push(
      `Visual review: ${er.visualReviewEvidence.visualReviewStatus}; source coverage=${er.visualReviewEvidence.sourceCoverage}; screenshots=${er.visualReviewEvidence.screenshotPaths.length}`,
    );
    lines.push(`Matrix path: ${er.visualReviewEvidence.path}`);
    lines.push(`Visual conclusion: ${er.visualReviewEvidence.conclusion}`);
    for (const screenshotPath of er.visualReviewEvidence.screenshotPaths) {
      lines.push(`- ${screenshotPath}`);
    }
    lines.push("");
    lines.push("## Eritrea Fresh Targeted Primary-Law Search");
    lines.push("");
    lines.push(`Result: ${er.freshPrimaryLawSearchAudit.result}`);
    lines.push(`Executed: ${er.freshPrimaryLawSearchAudit.executedAt}`);
    lines.push(
      `Official source standard: ${er.freshPrimaryLawSearchAudit.officialSourceStandard}`,
    );
    lines.push("");
    lines.push("| Query | Direct cannabis primary law found | Outcome |");
    lines.push("| --- | --- | --- |");
    for (const search of er.freshPrimaryLawSearchAudit.queries) {
      lines.push(
        `| ${mdCell(search.query)} | ${search.directCannabisPrimaryLawFound ? "YES" : "NO"} | ${mdCell(search.outcome)} |`,
      );
    }
    lines.push("");
    lines.push("| Official source reviewed | Direct cannabis primary law found | Finding |");
    lines.push("| --- | --- | --- |");
    for (const source of er.freshPrimaryLawSearchAudit.officialSourcesReviewed) {
      lines.push(
        `| ${mdCell(`${source.title} ${source.url}`)} | ${source.directCannabisPrimaryLawFound ? "YES" : "NO"} | ${mdCell(source.finding)} |`,
      );
    }
    if (
      Array.isArray(
        er.freshPrimaryLawSearchAudit.candidatePrimaryLawDocumentsNeedingOcr,
      )
    ) {
      lines.push("");
      lines.push("| Candidate primary-law document needing OCR | Text extraction | Legal effect | Required closure step |");
      lines.push("| --- | --- | --- | --- |");
      for (const candidate of er.freshPrimaryLawSearchAudit
        .candidatePrimaryLawDocumentsNeedingOcr) {
        const extraction = [
          candidate.localTextExtraction?.result,
          candidate.ocrAudit?.result,
        ]
          .filter(Boolean)
          .join("; ");
        lines.push(
          `| ${mdCell(`${candidate.title} ${candidate.sourcePageUrl || candidate.pdfUrl}`)} | ${mdCell(extraction)} | ${mdCell(candidate.legalEffectForTruthFirstAudit)} | ${mdCell(candidate.requiredClosureStep)} |`,
        );
      }
    }
    if (Array.isArray(er.freshPrimaryLawSearchAudit.secondaryClaimsRejected)) {
      lines.push("");
      lines.push("| Secondary claim class | Why it does not close ER |");
      lines.push("| --- | --- |");
      for (const source of er.freshPrimaryLawSearchAudit.secondaryClaimsRejected) {
        lines.push(
          `| ${mdCell(source.sourceType)} | ${mdCell(source.reason)} |`,
        );
      }
    }
    lines.push("");
    lines.push(er.freshPrimaryLawSearchAudit.conclusion);
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push(
    "- This artifact is blocker evidence only. It does not apply SSOT, status, map, or production changes.",
  );
  lines.push(
    "- ER remains a primary-law blocker unless a visible official cannabis schedule, Drug Offences Regulations list, gazette, ministry/regulator page, or court/parliament source naming cannabis/hashish/hemp is found.",
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function linksFor(row) {
  return [
    ...(Array.isArray(row?.directOfficialCannabisLawLinks) ? row.directOfficialCannabisLawLinks : []),
    ...(Array.isArray(row?.officialContextLinks) ? row.officialContextLinks : []),
    ...(Array.isArray(row?.supplementalOfficialLinks) ? row.supplementalOfficialLinks : []),
  ];
}

function genericNextEvidence(coverage) {
  if (coverage === "OFFICIAL_SOURCE_ACCESS_BLOCKED") {
    return "A normally trusted direct official source retrieval and browser-domain visual review; do not bypass certificate, WAF or access controls.";
  }
  if (coverage === "OFFICIAL_LEGAL_AXIS_PENDING_VISUAL_ACCEPTANCE") {
    return "A complete current official visual proof package that shows owner, domain, applicable legal text and effective rule.";
  }
  if (coverage === "NO_CANDIDATE_PAGE_FOUND") {
    return "An official Act, Gazette, Parliament, Ministry, regulator, court or primary-law repository source with an applicable cannabis-law fragment.";
  }
  return "Direct applicable primary-law evidence with readable cannabis/legal text and complete official visual proof, or a documented scope-exception proof where no unitary territorial regime can honestly be selected.";
}

function genericBlocker(reportRow, matrixRow, evaluation, generatedAt) {
  const coverage = String(
    reportRow.effectiveSourceCoverage || reportRow.diagnostics?.evidence?.effectiveSourceCoverage || matrixRow.sourceCoverage || "UNKNOWN",
  );
  const links = linksFor(matrixRow);
  const currentTruth = matrixRow.independentTruth || {};
  const erAudit = matrixRow.geo === "ER" ? ER_FRESH_TARGETED_SEARCH_AUDIT : null;
  return {
    geo: String(matrixRow.geo || reportRow.geo || ""),
    territory: String(matrixRow.territory || reportRow.territory || ""),
    status: `PRIMARY_LAW_${coverage}`,
    blockerType: `CANONICAL_PRIMARY_LAW_ACCEPTANCE_${coverage}`,
    currentTruthRule: String(currentTruth.rule || reportRow.truth?.ruleId || "UNKNOWN"),
    proposedTruthColor: String(currentTruth.color || reportRow.truth?.color || "UNKNOWN"),
    requiredNextEvidence: genericNextEvidence(coverage),
    evidenceSummary: String(evaluation.reason || "Canonical primary-law acceptance remains incomplete."),
    knownPrimaryLawBoundary: {
      status: coverage,
      proven: `Retained official links=${links.length}; direct links=${Array.isArray(matrixRow.directOfficialCannabisLawLinks) ? matrixRow.directOfficialCannabisLawLinks.length : 0}.`,
      missing: genericNextEvidence(coverage),
      legalConclusion: "This blocker is reporting metadata only and cannot alter any legal axis, Truth Color, SSOT, map, runtime or production state.",
    },
    freshPrimaryLawSearchAudit: erAudit || {
      source: "CANONICAL_MATRIX_AND_TRUTH_AUDIT",
      executedAt: generatedAt,
      result: "NO_NEW_EXTERNAL_SEARCH_RUN",
      officialSourceStandard: "Act, Statute, Gazette, Parliament, Ministry, Regulator, Court, or official primary-law repository copy.",
      queries: [],
      officialSourcesReviewed: [],
      conclusion: "This artifact derives the open acceptance gap from current local canonical evidence; it does not create a legal conclusion or perform network collection.",
    },
    localCollectorAudit: {
      source: "CANONICAL_MATRIX",
      path: path.relative(ROOT, MATRIX_307_PATH),
      selectedCandidates: links.length,
      fetchedCandidates: 0,
      hasCannabisPages: Array.isArray(matrixRow.directOfficialCannabisLawLinks) && matrixRow.directOfficialCannabisLawLinks.length > 0,
      candidateSample: [],
      conclusion: "Derived from retained matrix link provenance only; no external collection is run by this blocker report.",
    },
    visualReviewEvidence: buildVisualReviewEvidence(matrixRow.geo),
    officialContextSearch: {
      source: "NOT_RUN_BY_LOCAL_BLOCKER_REPORT",
      countryFilter: String(matrixRow.geo || ""),
      term: "",
      query: "",
      found: 0,
      url: "",
      results: [],
    },
    negativeSearches: [],
    supportingPrimaryLawContext: links.slice(0, 20).map((link) => ({
      title: String(link.title || ""),
      url: String(link.url || ""),
      sourceKind: String(link.sourceKind || link.source_type || "UNKNOWN"),
      legalUse: String(link.note || link.sourceAnnotation || link.evidenceScope || "Retained official provenance."),
    })),
    nonMutationDecision: "SOURCE_METADATA_AND_ACCEPTANCE_REPORT_ONLY; SSOT, map, runtime, production and deployment remain untouched.",
  };
}

export function derivePrimaryLawBlockers(report, matrix, generatedAt = new Date().toISOString()) {
  const matrixByGeo = new Map((Array.isArray(matrix?.rows) ? matrix.rows : []).map((row) => [row.geo, row]));
  return (Array.isArray(report?.rows) ? report.rows : [])
    .map((reportRow) => {
      const matrixRow = matrixByGeo.get(reportRow.geo);
      if (!matrixRow) throw new Error(`PRIMARY_LAW_BLOCKER_MATRIX_ROW_MISSING:${reportRow.geo}`);
      const evaluation = evaluatePrimaryLaw(reportRow, matrixRow, null);
      return evaluation.status === "PROVEN" ? null : genericBlocker(reportRow, matrixRow, evaluation, generatedAt);
    })
    .filter(Boolean)
    .sort((left, right) => left.geo.localeCompare(right.geo));
}

async function main() {
  const generatedAt = new Date().toISOString();
  const report = JSON.parse(fs.readFileSync(TRUTH_REPORT_PATH, "utf8"));
  const matrix = JSON.parse(fs.readFileSync(MATRIX_307_PATH, "utf8"));
  const blockers = derivePrimaryLawBlockers(report, matrix, generatedAt);
  const output = {
    generatedAt,
    reportVersion: "2.0.0",
    nonMutating: true,
    purpose: "Derive every unresolved primary-law acceptance blocker from the current canonical Truth report and matrix without applying SSOT/status/map/prod mutations.",
    blockersTotal: blockers.length,
    blockers,
    resolvedPrimaryLawEvidence: [],
  };

  fs.mkdirSync(path.dirname(OUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD_PATH, buildMarkdown(output));

  console.log(`PRIMARY_LAW_BLOCKERS=${output.blockersTotal}`);
  console.log(`PRIMARY_LAW_BLOCKERS_OUTPUT=${path.relative(ROOT, OUT_JSON_PATH)}`);
  console.log(`PRIMARY_LAW_BLOCKERS_MARKDOWN=${path.relative(ROOT, OUT_MD_PATH)}`);
  for (const blocker of output.blockers) {
    console.log(
      `PRIMARY_LAW_BLOCKER_${blocker.geo}=${blocker.status} negative_terms=${blocker.negativeSearches
        .map((search) => `${search.term}:${search.found}`)
        .join(",")}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
