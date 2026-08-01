#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REVIEWED_AT = "2026-07-30T16:35:00.000Z";
const GEO = "UG";
const SOURCE_PDF = path.join(
  "/Users/james/Downloads",
  "Narcotic Drugs and Psychotropic Substances (Control) Act, 2023.pdf",
);
const COMMENCEMENT_PDF = path.join(
  ROOT,
  "tmp/pdfs/ug-act-si-2025-42.pdf",
);
const LEDGER_PATH = path.join(
  ROOT,
  "data/official/cannabis_law_visual_reviews.audit.json",
);
const REPORT_PATH = path.join(
  ROOT,
  "data/reviews/wiki-truth-UG-2025-primary-law-review.json",
);
const SCREENSHOT_DIR = path.join(
  ROOT,
  "data/reviews/screenshots/wiki-truth-ug-2025",
);
const EVIDENCE_DIR = path.join(ROOT, "data/reviews/primary-law/UG");

const ACT_URL =
  "https://cmis.parliament.go.ug/cmis/views/470d1854-f312-40af-8d18-54f31210af00%3B1.0";
const PARLIAMENT_INDEX_URL =
  "https://web.parliament.go.ug/acts/acts-2023";
const CURRENT_ACT_URL =
  "https://ulii.org/en/akn/ug/act/2024/2/eng@2024-02-23";
const COMMENCEMENT_URL =
  "https://media.ulii.org/media/legislation/119028/source_file/d019748bf7a8aab8/ug-act-si-2025-42-publication-document.pdf";

const screenshotInputs = [
  ["tmp/pdfs/ug2025-act-page-1.png", "UG-act-2023-title.png"],
  ["tmp/pdfs/ug2025-act-page-8.png", "UG-act-section-1-commencement.png"],
  ["tmp/pdfs/ug2025-act-page-17.png", "UG-act-section-4-possession.png"],
  ["tmp/pdfs/ug2025-act-page-20.png", "UG-act-section-7-prescription.png"],
  ["tmp/pdfs/ug2025-act-page-22.png", "UG-act-section-11-cultivation.png"],
  ["tmp/pdfs/ug2025-act-page-24.png", "UG-act-section-14-licensing.png"],
  ["tmp/pdfs/ug2025-act-page-71.png", "UG-act-schedule-2-cannabis.png"],
  ["tmp/pdfs/ug2025-act-page-85.png", "UG-act-schedule-4-cannabis.png"],
  ["tmp/pdfs/ug2025-si-page-1.png", "UG-SI-2025-42-commencement.png"],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function relative(filePath) {
  return path.relative(ROOT, filePath);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function upsertByUrl(items, source) {
  const next = Array.isArray(items) ? [...items] : [];
  const index = next.findIndex((item) => item?.url === source.url);
  if (index >= 0) next[index] = { ...next[index], ...source };
  else next.push(source);
  return next;
}

for (const filePath of [SOURCE_PDF, COMMENCEMENT_PDF, LEDGER_PATH]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`UGANDA_PRIMARY_LAW_INPUT_MISSING path=${filePath}`);
  }
}

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
const screenshotPaths = screenshotInputs.map(([sourceRelative, targetName]) => {
  const sourcePath = path.join(ROOT, sourceRelative);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`UGANDA_PRIMARY_LAW_SCREENSHOT_MISSING path=${sourcePath}`);
  }
  const targetPath = path.join(SCREENSHOT_DIR, targetName);
  fs.copyFileSync(sourcePath, targetPath);
  return relative(targetPath);
});

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const commencementEvidencePath = path.join(
  EVIDENCE_DIR,
  "ug-act-si-2025-42-commencement.pdf",
);
fs.copyFileSync(COMMENCEMENT_PDF, commencementEvidencePath);

const ledger = readJson(LEDGER_PATH);
const row = (ledger.rows || []).find((item) => item.geo === GEO);
if (!row) throw new Error("UGANDA_VISUAL_REVIEW_ROW_MISSING");

const actNote =
  "Parliament PDF titled Act 2023 was visually reviewed at the exact pages for section 1, sections 4, 7, 11 and 14, Schedule 2 and Schedule 4. The current consolidated citation is Uganda Act 2 of 2024, Cap. 37. Cannabis and cannabis resin are Schedule 2 narcotic drugs and cannabis is a Schedule 4 prohibited plant. Unlicensed possession and cultivation remain offences. Sections 4 and 7 create controlled medical possession, prescription and pharmacist-supply routes for scheduled narcotic drugs; sections 11 and 14 create licensing routes. These routes do not by themselves prove cannabis-specific service delivery.";
const commencementNote =
  "Uganda Gazette Statutory Instrument 42 of 2025 appoints 14 April 2025 as the commencement date for the Narcotic Drugs and Psychotropic Substances (Control) Act, Cap. 37. This proves current force, not cannabis-specific service delivery.";
const comparisonReason =
  "Fresh Primary Law review confirms that Uganda Act 2 of 2024, Cap. 37 came into force on 14 April 2025. Recreational cannabis remains illegal. Cannabis is expressly scheduled, while the Act creates limited controlled prescription, pharmacist-supply, cultivation and medical-purpose licensing routes. Cannabis-specific service delivery was not established by the reviewed sources. Truth color therefore remains YELLOW. Wikipedia and the project status pair remain more restrictive on the medical axis. No status SSOT, map, runtime or production data was changed.";
const conclusion =
  "VISUALLY_VERIFIED_CURRENT_PRIMARY_LAW: Uganda cannabis law is in force from 14 April 2025. Recreational use and unlicensed possession/cultivation are prohibited. The Act provides limited controlled medical and licensing routes, but cannabis-specific service delivery is not proven. Truth color remains YELLOW.";

row.status = "VISUALLY_VERIFIED";
row.screenshot_paths = unique([
  ...(row.screenshot_paths || []),
  ...screenshotPaths,
]);
row.verified_sources = upsertByUrl(row.verified_sources, {
  title:
    "Parliament of Uganda - Narcotic Drugs and Psychotropic Substances (Control) Act, 2023; current citation Act 2 of 2024, Cap. 37",
  url: ACT_URL,
  source_kind:
    "UGANDA_ACT_2_OF_2024_CAP37_COMMENCED_CANNABIS_SCHEDULE2_SCHEDULE4_POSSESSION_PRESCRIPTION_PHARMACY_CULTIVATION_AND_LICENSING",
  screenshot_path:
    "data/reviews/screenshots/wiki-truth-ug-2025/UG-act-schedule-2-cannabis.png",
  note: actNote,
});
row.verified_sources = upsertByUrl(row.verified_sources, {
  title:
    "Uganda Gazette - Statutory Instrument 42 of 2025 commencement of Cap. 37",
  url: COMMENCEMENT_URL,
  source_kind:
    "UGANDA_GAZETTE_SI_42_OF_2025_CAP37_COMMENCED_2025_04_14",
  screenshot_path:
    "data/reviews/screenshots/wiki-truth-ug-2025/UG-SI-2025-42-commencement.png",
  note: commencementNote,
});
row.verified_context_sources = upsertByUrl(row.verified_context_sources, {
  title:
    "ULII current consolidated Act 2 of 2024, Cap. 37 with commencement history",
  url: CURRENT_ACT_URL,
  source_kind:
    "UGANDA_CURRENT_CONSOLIDATED_ACT_AND_LIFECYCLE_CONTEXT",
  evidence_scope: "OFFICIAL_CONTEXT_ONLY",
  screenshot_path:
    "data/reviews/screenshots/wiki-truth-ug-2025/UG-act-section-1-commencement.png",
  note:
    "Current consolidated legal text records publication on 23 February 2024, assent on 2 February 2024 and commencement on 14 April 2025.",
});
row.verified_context_sources = upsertByUrl(row.verified_context_sources, {
  title: "Parliament of Uganda - Acts 2023 index",
  url: PARLIAMENT_INDEX_URL,
  source_kind:
    "UGANDA_PARLIAMENT_ACTS_INDEX_IDENTIFIES_SOURCE_PDF",
  evidence_scope: "OFFICIAL_CONTEXT_ONLY",
  screenshot_path:
    "data/reviews/screenshots/wiki-truth-ug-2025/UG-act-2023-title.png",
  note:
    "The Parliament index identifies the supplied Act PDF. The Gazette and current consolidated citation control lifecycle interpretation.",
});
row.official_status = {
  recreational:
    "ILLEGAL_CURRENT_ACT_IN_FORCE_CANNABIS_SCHEDULE2_NARCOTIC_AND_SCHEDULE4_PROHIBITED_PLANT_POSSESSION_AND_UNLICENSED_CULTIVATION_OFFENCES",
  medical:
    "LIMITED PRESCRIPTION AND PHARMACIST SUPPLY AND MEDICAL PURPOSE LICENSING ONLY; COMMENCED 2025-04-14; CANNABIS SPECIFIC SERVICE DELIVERY NOT EVIDENCED",
  enforcement:
    "STRICT_CURRENT_ACT_IN_FORCE_POSSESSION_UP_TO_TWENTY_YEARS_TRAFFICKING_UP_TO_LIFE_AND_UNLICENSED_PROHIBITED_PLANT_CULTIVATION_OFFENCE",
};
row.project_comparison = {
  status:
    "PROJECT_MEDICAL_STATUS_MORE_RESTRICTIVE_THAN_CURRENT_LIMITED_STATUTORY_ROUTE",
  reason: comparisonReason,
};
row.conclusion = conclusion;
row.latest_primary_law_update = {
  reviewed_at: REVIEWED_AT,
  source_pdf: SOURCE_PDF,
  source_pdf_sha256: sha256(SOURCE_PDF),
  current_citation: "Narcotic Drugs and Psychotropic Substances (Control) Act, 2024, Act 2 of 2024, Cap. 37",
  commencement_date: "2025-04-14",
  commencement_instrument: "Statutory Instrument 42 of 2025",
  commencement_pdf_sha256: sha256(COMMENCEMENT_PDF),
  legal_state: "COMMENCED_IN_FORCE",
  truth_color_before: "YELLOW",
  truth_color_after: "YELLOW",
  patient_access_operational: false,
  mutation_boundary:
    "AUDIT_ONLY_NO_STATUS_SSOT_MAP_RUNTIME_OR_PRODUCTION_MUTATION",
};
ledger.reviewed_at = REVIEWED_AT;
writeJson(LEDGER_PATH, ledger);

const report = {
  schemaVersion: 1,
  generatedAt: REVIEWED_AT,
  geo: GEO,
  territory: "Uganda",
  verdict: {
    truthStatus: "LIMITED_LAWFUL_CONTROLLED_MEDICAL_AND_LICENSING_ROUTE",
    truthColor: "YELLOW",
    colorChanged: false,
    reason:
      "The Act is in force and provides limited controlled routes, but cannabis-specific service delivery was not proven.",
  },
  lifecycle: {
    parliamentPdfTitle:
      "Narcotic Drugs and Psychotropic Substances (Control) Act, 2023",
    currentCitation:
      "Narcotic Drugs and Psychotropic Substances (Control) Act, 2024, Act 2 of 2024, Cap. 37",
    assented: "2024-02-02",
    published: "2024-02-23",
    commenced: "2025-04-14",
    commencementInstrument: "Statutory Instrument 42 of 2025",
  },
  legalAxes: {
    adultUse: false,
    recreationalPossession: "ILLEGAL_UNLESS_STATUTORY_EXCEPTION",
    personalCultivation: "ILLEGAL_WITHOUT_MINISTERIAL_LICENCE",
    prescription: "STATUTORILY_PERMITTED_FOR_SCHEDULED_NARCOTIC_DRUGS",
    pharmacistSupply: "STATUTORILY_PERMITTED_ON_PRESCRIPTION",
    cultivationCommercial:
      "MINISTERIAL_LICENCE_ROUTE_FOR_PROHIBITED_PLANTS",
    production: "NDA_MEDICAL_PURPOSE_LICENSING_ROUTE",
    importExport: "LICENSED_CONTROL_ROUTE",
    cannabisSpecificOperationalProgramme: "NOT_PROVEN",
    registeredCannabisMedicine: "NOT_PROVEN",
    patientRegistry: "NOT_PROVEN",
    legalState: "COMMENCED_IN_FORCE",
  },
  primaryLawFindings: [
    {
      provision: "section 1",
      finding:
        "The Act required a commencement statutory instrument.",
      screenshot:
        "data/reviews/screenshots/wiki-truth-ug-2025/UG-act-section-1-commencement.png",
    },
    {
      provision: "Statutory Instrument 42 of 2025, regulation 2",
      finding: "The Act commenced on 14 April 2025.",
      screenshot:
        "data/reviews/screenshots/wiki-truth-ug-2025/UG-SI-2025-42-commencement.png",
    },
    {
      provision: "sections 4 and 7",
      finding:
        "Controlled medical possession, prescription and pharmacist supply are statutory exceptions for scheduled narcotic drugs.",
      screenshots: [
        "data/reviews/screenshots/wiki-truth-ug-2025/UG-act-section-4-possession.png",
        "data/reviews/screenshots/wiki-truth-ug-2025/UG-act-section-7-prescription.png",
      ],
    },
    {
      provision: "sections 11 and 14",
      finding:
        "The Act creates ministerial prohibited-plant cultivation licences and NDA medical-purpose sale, manufacture, production and distribution licences.",
      screenshots: [
        "data/reviews/screenshots/wiki-truth-ug-2025/UG-act-section-11-cultivation.png",
        "data/reviews/screenshots/wiki-truth-ug-2025/UG-act-section-14-licensing.png",
      ],
    },
    {
      provision: "Schedule 2 and Schedule 4",
      finding:
        "Cannabis and cannabis resin are narcotic drugs; cannabis is a prohibited plant.",
      screenshots: [
        "data/reviews/screenshots/wiki-truth-ug-2025/UG-act-schedule-2-cannabis.png",
        "data/reviews/screenshots/wiki-truth-ug-2025/UG-act-schedule-4-cannabis.png",
      ],
    },
  ],
  auditComparisons: {
    wikipedia:
      "BEHIND_OR_OVERSIMPLIFIED_IF_REPORTED_ONLY_AS_MEDICAL_ILLEGAL",
    projectStatus:
      "MEDICAL_NONE_IS_MORE_RESTRICTIVE_THAN_THE_LIMITED_STATUTORY_ROUTE",
    legacyLawProfile:
      "data/laws/world/UG.json remains a separately tracked stale legacy profile and was not mutated under the audit-only boundary.",
  },
  sources: [
    {
      title:
        "Parliament of Uganda - Narcotic Drugs and Psychotropic Substances (Control) Act PDF",
      url: ACT_URL,
      localPath: SOURCE_PDF,
      sha256: sha256(SOURCE_PDF),
    },
    {
      title:
        "Uganda Gazette - Statutory Instrument 42 of 2025",
      url: COMMENCEMENT_URL,
      localPath: relative(commencementEvidencePath),
      sha256: sha256(commencementEvidencePath),
    },
    {
      title: "ULII current consolidated Act 2 of 2024, Cap. 37",
      url: CURRENT_ACT_URL,
    },
    {
      title: "Parliament of Uganda Acts 2023 index",
      url: PARLIAMENT_INDEX_URL,
    },
  ],
  screenshots: screenshotPaths,
  mutationProof: {
    statusSsotChanged: false,
    mapChanged: false,
    runtimeChanged: false,
    productionChanged: false,
  },
};
writeJson(REPORT_PATH, report);

console.log(
  `UGANDA_PRIMARY_LAW_UPDATE=PASS geo=${GEO} color=YELLOW commenced=2025-04-14 screenshots=${screenshotPaths.length}`,
);
