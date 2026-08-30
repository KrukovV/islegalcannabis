#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "../playwright_runtime.mjs";
import { acquireProjectProcessSlot } from "../runtime/processSlots.mjs";

const ROOT = process.cwd();
const REVIEWED_AT = "2026-07-20";
const OUTPUT_DIR = path.join(
  os.homedir(),
  "islegalcannabis_archive",
  "cannabis-law-screenshots",
  REVIEWED_AT,
  "project-null-7-fresh",
);
const TMP_DIR = path.join(ROOT, "tmp", "pdfs", "project-null-7-fresh");
const REPORT_PATH = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-project-null-7-fresh-visual-captures.json",
);
const USER_AGENT = "islegalcannabis-project-null-7-visual-audit/1.0";

const candidates = [
  {
    id: "BJN-SER-icj-sovereignty",
    geos: ["BJN", "SER"],
    kind: "html",
    role: "NEUTRAL_JURISDICTION_SCOPE",
    url: "https://www.icj-cij.org/node/103212",
    terms: [
      "Republic of Colombia has sovereignty over the islands at",
      "Bajo Nuevo, East-Southeast Cays, Quitasueño, Roncador, Serrana and Serranilla",
    ],
  },
  {
    id: "BJN-SER-colombia-medical-cannabis",
    geos: ["BJN", "SER"],
    kind: "html",
    role: "ADMINISTERING_STATE_DIRECT_CANNABIS_LAW",
    url: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=80394",
    terms: ["territorio nacional colombiano", "uso médico y científico del cannabis", "ARTÍCULO 3"],
  },
  {
    id: "BJN-SER-colombia-personal-dose",
    geos: ["BJN", "SER"],
    kind: "html",
    role: "ADMINISTERING_STATE_CURRENT_CANNABIS_JUDGMENT",
    url: "https://www.corteconstitucional.gov.co/relatoria/2023/C-127-23.htm",
    terms: ["dosis personal", "cannabis", "porte y consumo"],
  },
  {
    id: "BRT-un-ngo-unclaimed-context",
    geos: ["BRT"],
    kind: "pdf",
    role: "UN_HOSTED_NGO_CONTEXT_NOT_BINDING_LAW",
    url: "https://digitallibrary.un.org/record/4087607/files/A_80_304-EN.pdf",
    terms: ["Bir Tawil", "unclaimed territory"],
    forcedPage: 10,
  },
  {
    id: "BRT-un-los-egypt-boundary",
    geos: ["BRT"],
    kind: "pdf",
    role: "EGYPT_OFFICIAL_BOUNDARY_POSITION",
    url: "https://digitallibrary.un.org/record/3890922/files/LOS_94_WEB.pdf",
    terms: ["22nd parallel north", "official maps of Egypt"],
    forcedPage: 25,
  },
  {
    id: "BRT-un-los-sudan-boundary",
    geos: ["BRT"],
    kind: "pdf",
    role: "SUDAN_OFFICIAL_BOUNDARY_POSITION",
    url: "https://digitallibrary.un.org/record/3890922/files/LOS_94_WEB.pdf",
    terms: ["Government of the Republic of the Sudan", "Hala'ib"],
    forcedPage: 26,
  },
  {
    id: "BRT-egypt-law-182-cannabis",
    geos: ["BRT"],
    kind: "pdf",
    role: "EGYPT_ACCESS_STATE_DIRECT_CANNABIS_LAW",
    url: "https://www.edaegypt.gov.eg/media/ekgifxb3/1960-182.pdf",
    terms: ["Cannabis Sativa", "Indian Hemp"],
    forcedPage: 13,
  },
  {
    id: "BRT-egypt-current-amendments-index",
    geos: ["BRT"],
    kind: "html",
    role: "EGYPT_ACCESS_STATE_CURRENT_LAW_INDEX",
    url: "https://www.edaegypt.gov.eg/en/the-regulatory-reference-of-the-egyptian-drug-authority-eda/laws-and-executive-regulations/",
    terms: ["Law No. 182 of 1960 and its amendments", "Anti-Narcotics"],
  },
  {
    id: "BRT-sudan-current-cannabis-enforcement",
    geos: ["BRT"],
    kind: "html",
    role: "SUDAN_ACCESS_STATE_CURRENT_JUDICIARY_CANNABIS_ENFORCEMENT",
    url: "https://sj.gov.sd/ar/content/book/%D8%AD%D9%83%D9%88%D9%85%D8%A9-%D8%A7%D9%84%D8%B3%D9%88%D8%AF%D8%A7%D9%86-%D8%B6%D8%AF-%D8%A2-%D9%8A-%D8%A3-%D8%A3-%D8%A7-%D9%85-%D8%B9%D8%BA-%D8%A5%D9%85%D8%A4%D8%A8%D8%AF542017%D9%85",
    terms: ["THC", "نبات القنب"],
  },
  {
    id: "SCR-philippines-scope",
    geos: ["SCR"],
    kind: "html",
    role: "PHILIPPINES_CLAIMANT_SCOPE",
    url: "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/23187",
    terms: ["Bajo de Masinloc", "Scarborough Shoal"],
  },
  {
    id: "SCR-PGA-philippines-ra9165",
    geos: ["SCR", "PGA"],
    kind: "html",
    role: "PHILIPPINES_CLAIMANT_DIRECT_CANNABIS_LAW",
    url: "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/1435",
    terms: ["Cannabis or commonly known as Marijuana", "Indian Hemp", "marijuana resin"],
  },
  {
    id: "SCR-china-scope",
    geos: ["SCR"],
    kind: "html",
    role: "CHINA_CLAIMANT_SCOPE",
    url: "https://ph.china-embassy.gov.cn/eng/xwfb/201206/t20120608_1180427.htm",
    terms: ["Huangyan Island", "sovereignty"],
  },
  {
    id: "SCR-PGA-china-cannabis-law",
    geos: ["SCR", "PGA"],
    kind: "html",
    role: "CHINA_CLAIMANT_DIRECT_CANNABIS_LAW",
    url: "https://english.court.gov.cn/2015-12/01/c_761557_32.htm",
    terms: ["marijuana", "Article 357", "illegally possessing narcotic drugs"],
  },
  {
    id: "SCR-taiwan-scope",
    geos: ["SCR"],
    kind: "html",
    role: "TAIWAN_CLAIMANT_SCOPE",
    url: "https://en.mofa.gov.tw/News_Content.aspx?n=1330&s=118583",
    terms: ["Scarborough Shoal", "Huangyan Island", "ROC (Taiwan) territory"],
  },
  {
    id: "SCR-PGA-taiwan-cannabis-schedule",
    geos: ["SCR", "PGA"],
    kind: "html",
    role: "TAIWAN_CLAIMANT_DIRECT_CANNABIS_STATUS",
    url: "https://www.fda.gov.tw/TC/newsContent.aspx?id=25250",
    terms: ["大麻(含製品)屬第二級毒品", "大麻在我國合法嗎", "Marijuana"],
  },
  {
    id: "KAS-india-ndps-cannabis",
    geos: ["KAS"],
    kind: "pdf",
    role: "INDIA_CLAIMANT_DIRECT_CANNABIS_LAW",
    url: "https://www.indiacode.nic.in/bitstream/123456789/6834/1/narcotic-drugs-and-psychotropic-substances-act-1985.pdf",
    terms: ["cannabis (hemp)", "charas", "ganja"],
  },
  {
    id: "KAS-india-medical-scientific-exception",
    geos: ["KAS"],
    kind: "pdf",
    role: "INDIA_CLAIMANT_MEDICAL_SCIENTIFIC_SCOPE",
    url: "https://www.indiacode.nic.in/bitstream/123456789/6834/1/narcotic-drugs-and-psychotropic-substances-act-1985.pdf",
    terms: ["medical and scientific purposes", "medical or scientific purposes"],
  },
  {
    id: "KAS-pakistan-cnsa-cannabis",
    geos: ["KAS"],
    kind: "pdf",
    role: "PAKISTAN_CLAIMANT_DIRECT_CANNABIS_LAW",
    url: "https://pakistancode.gov.pk/pdffiles/administrator739c7aa745c5afab5decf2e100caf1c5.pdf",
    terms: ["cannabis", "charas", "ganja"],
  },
  {
    id: "KAS-pakistan-ccra-2024",
    geos: ["KAS"],
    kind: "pdf",
    role: "PAKISTAN_CLAIMANT_REGULATED_MEDICINAL_CANNABIS_LAW",
    url: "https://www.pakistancode.gov.pk/pdffiles/administrator135567794d629a6ce6f1b32daadc651d.pdf",
    terms: ["medicinal and industrial use", "extends to the whole of Pakistan"],
  },
  {
    id: "KAS-pakistan-ccra-amendment-2026",
    geos: ["KAS"],
    kind: "pdf",
    role: "PAKISTAN_CLAIMANT_CURRENT_CANNABIS_LAW_AMENDMENT",
    url: "https://na.gov.pk/uploads/documents/69d4e17704917_332.pdf",
    terms: ["Cannabis Control and Regulatory Authority", "Amendment Act, 2026"],
  },
  {
    id: "KAS-pakistan-siachen-scope",
    geos: ["KAS"],
    kind: "pdf",
    role: "PAKISTAN_CLAIMANT_SCOPE",
    url: "https://mofa.gov.pk/storage/files/1/65451083a984b.pdf",
    terms: ["Siachen", "Jammu and Kashmir"],
    forcedPage: 16,
  },
  {
    id: "KAS-india-siachen-scope",
    geos: ["KAS"],
    kind: "pdf",
    role: "INDIA_CLAIMANT_SCOPE",
    url: "https://www.mea.gov.in/Uploads/PublicationDocs/23460_IWM_Book__11-06-2014_.pdf",
    terms: ["Siachen", "NJ 9842"],
    forcedPage: 157,
  },
  {
    id: "SPI-argentina-medical-cannabis",
    geos: ["SPI"],
    kind: "html",
    role: "ARGENTINA_CLAIMANT_DIRECT_MEDICAL_CANNABIS_LAW",
    url: "https://www.argentina.gob.ar/normativa/nacional/ley-27350-273801/actualizacion",
    terms: ["uso medicinal", "planta de cannabis", "Artículo 1"],
  },
  {
    id: "SPI-argentina-current-personal-possession",
    geos: ["SPI"],
    kind: "pdf",
    role: "ARGENTINA_CLAIMANT_CURRENT_JUDICIAL_ENFORCEMENT_SCOPE",
    url: "https://www.csjn.gov.ar/tribunales-federales-nacionales/d/sentencia-SGU-c6f9c533-7cd8-4163-83f2-2d1ee9733d14.pdf",
    terms: ["cannabis", "tenencia para consumo personal", "Arriola"],
  },
  {
    id: "SPI-chile-medical-cannabis-2023",
    geos: ["SPI"],
    kind: "html",
    role: "CHILE_CLAIMANT_DIRECT_MEDICAL_CANNABIS_LAW",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=1192530&idParte=10432735",
    terms: ["cultivo de especies vegetales del género cannabis", "tratamiento médico", "receta"],
  },
  {
    id: "SPI-chile-cannabis-control",
    geos: ["SPI"],
    kind: "html",
    role: "CHILE_CLAIMANT_DIRECT_CANNABIS_CONTROL_LAW",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=13057",
    terms: ["cannabis, resina de cannabis", "extractos y tinturas de cannabis"],
  },
  {
    id: "SPI-chile-boundary-scope",
    geos: ["SPI"],
    kind: "html",
    role: "CHILE_CLAIMANT_SCOPE",
    url: "https://www.minrel.gob.cl/sala-de-prensa/comunicado-por-inventario-nacional-de-glaciares-de-argentina",
    terms: ["Campo de Hielo Sur", "Acuerdo", "Sección B"],
  },
  {
    id: "PGA-un-six-claimants",
    geos: ["PGA"],
    kind: "pdf",
    role: "MULTI_CLAIMANT_JURISDICTION_SCOPE",
    url: "https://digitallibrary.un.org/record/155981/files/A_47_623-EN.pdf",
    terms: ["Spratly", "six parties"],
    forcedPage: 15,
  },
  {
    id: "PGA-brunei-cannabis-law",
    geos: ["PGA"],
    kind: "pdf",
    role: "BRUNEI_CLAIMANT_DIRECT_CANNABIS_LAW",
    url: "https://www.agc.gov.bn/AGC%20Images/LAWS/ACT_PDF/cap027.pdf",
    terms: ["cannabis resin", "Class A drug", "cannabis mixture"],
  },
  {
    id: "PGA-malaysia-cannabis-definition",
    geos: ["PGA"],
    kind: "pdf",
    role: "MALAYSIA_CLAIMANT_DIRECT_CANNABIS_LAW",
    url: "https://lom.agc.gov.my/ilims/upload/portal/akta/outputaktap/1840725_BI/22.11.2023%20-%20Act%20234.pdf",
    terms: ["cannabis means", "cannabis resin"],
  },
  {
    id: "PGA-malaysia-possession",
    geos: ["PGA"],
    kind: "pdf",
    role: "MALAYSIA_CLAIMANT_DIRECT_CANNABIS_ENFORCEMENT",
    url: "https://lom.agc.gov.my/ilims/upload/portal/akta/outputaktap/1840725_BI/22.11.2023%20-%20Act%20234.pdf",
    terms: ["Possession of raw opium, coca leaves, poppy-straw and cannabis", "shall be guilty of an offence"],
  },
  {
    id: "PGA-philippines-current-cannabis-judgment",
    geos: ["PGA"],
    kind: "html",
    role: "PHILIPPINES_CLAIMANT_CURRENT_CANNABIS_ENFORCEMENT",
    url: "https://sc.judiciary.gov.ph/sc-acquits-accused-of-planting-marijuana-due-to-police-chain-of-custody-lapses/",
    terms: ["planting marijuana in violation of Republic Act No. (RA) 9165", "seized marijuana"],
  },
  {
    id: "PGA-vietnam-decree-28-2026",
    geos: ["PGA"],
    kind: "pdf",
    role: "VIETNAM_CLAIMANT_CURRENT_DIRECT_CANNABIS_SCHEDULE",
    url: "https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/01/28-cp.signed.pdf",
    terms: ["Cây cần sa", "Cannabis", "Chế phẩm từ cây cần sa"],
    forcedPage: 5,
  },
  {
    id: "PGA-vietnam-law-73-2021",
    geos: ["PGA"],
    kind: "pdf",
    role: "VIETNAM_CLAIMANT_DIRECT_CANNABIS_LAW",
    url: "https://datafiles.chinhphu.vn/cpp/files/vbpq/2022/01/73luat.pdf",
    terms: ["cây cần sa", "Cannabis", "nghiêm cấm"],
  },
];

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function pageText(pdfPath, page) {
  try {
    return run("pdftotext", [
      "-f",
      String(page),
      "-l",
      String(page),
      "-layout",
      pdfPath,
      "-",
    ]);
  } catch {
    return "";
  }
}

function findPdfPage(pdfPath, terms, forcedPage) {
  const info = run("pdfinfo", [pdfPath]);
  const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
  if (forcedPage) {
    const text = pageText(pdfPath, forcedPage);
    const matchedTerm = terms.find((term) =>
      text.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
    );
    return { pageCount, page: forcedPage, matchedTerm: matchedTerm || null, text };
  }
  for (const term of terms) {
    for (let page = 1; page <= pageCount; page += 1) {
      const text = pageText(pdfPath, page);
      if (text.toLocaleLowerCase().includes(term.toLocaleLowerCase())) {
        return { pageCount, page, matchedTerm: term, text };
      }
    }
  }
  return { pageCount, page: 1, matchedTerm: null, text: pageText(pdfPath, 1) };
}

function capturePdf(candidate) {
  const pdfPath = path.join(TMP_DIR, `${candidate.id}.pdf`);
  run("curl", [
    "-L",
    "--fail",
    "--compressed",
    "--max-time",
    "120",
    "-A",
    USER_AGENT,
    "-o",
    pdfPath,
    candidate.url,
  ]);
  const found = findPdfPage(
    pdfPath,
    candidate.terms,
    candidate.forcedPage,
  );
  const renderPrefix = path.join(TMP_DIR, `${candidate.id}-page`);
  run("pdftoppm", [
    "-f",
    String(found.page),
    "-l",
    String(found.page),
    "-singlefile",
    "-png",
    "-r",
    "170",
    pdfPath,
    renderPrefix,
  ]);
  const screenshotPath = path.join(OUTPUT_DIR, `${candidate.id}.png`);
  fs.copyFileSync(`${renderPrefix}.png`, screenshotPath);
  return {
    captureKind: "RENDERED_PDF_PAGE",
    httpStatus: 200,
    finalUrl: candidate.url,
    title: path.basename(candidate.url),
    page: found.page,
    pageCount: found.pageCount,
    matchedTerm: found.matchedTerm,
    textExcerpt: found.text.replace(/\s+/g, " ").trim().slice(0, 2400),
    screenshotPath,
    screenshotBytes: fs.statSync(screenshotPath).size,
  };
}

async function captureHtml(page, candidate) {
  const response = await page.goto(candidate.url, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    for (const selector of [
      "#cookie-law-info-bar",
      ".cli-modal",
      ".cli-modal-backdrop",
      ".cookie-notice",
      "[class*='cookie-banner']",
      "[class*='CookieBanner']",
    ]) {
      document.querySelectorAll(selector).forEach((element) => element.remove());
    }
  });
  const match = await page.evaluate((terms) => {
    const foldedTerms = terms.map((term) => term.toLocaleLowerCase());
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = String(node.nodeValue || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const folded = text.toLocaleLowerCase();
      const termIndex = foldedTerms.findIndex((term) => folded.includes(term));
      const element = node.parentElement;
      const rect = element?.getBoundingClientRect();
      const style = element ? getComputedStyle(element) : null;
      if (
        termIndex >= 0 &&
        rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        style?.display !== "none" &&
        style?.visibility !== "hidden"
      ) {
        element?.scrollIntoView({ block: "center", inline: "nearest" });
        element?.setAttribute("data-islegal-visual-match", "1");
        if (element instanceof HTMLElement) {
          element.style.outline = "4px solid #16a34a";
          element.style.background = "#f0fdf4";
        }
        return { term: terms[termIndex], text: text.slice(0, 2400) };
      }
    }
    return {
      term: null,
      text: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 2400),
    };
  }, candidate.terms);
  if (match.term) {
    const matchedLocator = page.locator('[data-islegal-visual-match="1"]').first();
    if (await matchedLocator.count()) {
      await matchedLocator.scrollIntoViewIfNeeded();
    }
  }
  await page.waitForTimeout(500);
  await page.evaluate(({ id, url, term }) => {
    document.getElementById("islegal-project-null-7-proof")?.remove();
    const banner = document.createElement("div");
    banner.id = "islegal-project-null-7-proof";
    banner.textContent = `${id} | ${term || "NO_TERM_MATCH"} | ${url}`;
    Object.assign(banner.style, {
      position: "fixed",
      inset: "0 0 auto 0",
      zIndex: "2147483647",
      padding: "9px 12px",
      overflow: "hidden",
      whiteSpace: "nowrap",
      background: "#111827",
      borderBottom: "4px solid #16a34a",
      color: "white",
      font: "14px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
    });
    document.documentElement.appendChild(banner);
  }, { id: candidate.id, url: candidate.url, term: match.term });
  const screenshotPath = path.join(OUTPUT_DIR, `${candidate.id}.png`);
  await page.screenshot({ path: screenshotPath, type: "png", fullPage: false });
  return {
    captureKind: "ISOLATED_HEADLESS_HTML_VIEWPORT",
    httpStatus: response?.status() || null,
    finalUrl: page.url(),
    title: await page.title(),
    page: null,
    pageCount: null,
    matchedTerm: match.term,
    textExcerpt: match.text,
    screenshotPath,
    screenshotBytes: fs.statSync(screenshotPath).size,
  };
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const selectedIds = new Set(
  String(process.env.IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const selectedCandidates = selectedIds.size
  ? candidates.filter((candidate) => selectedIds.has(candidate.id))
  : candidates;
const previousRows = fs.existsSync(REPORT_PATH)
  ? JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")).rows || []
  : [];
const rowsById = new Map(previousRows.map((row) => [row.id, row]));
const rows = () => candidates
  .map((candidate) => rowsById.get(candidate.id))
  .filter(Boolean);
function writeReport() {
  const currentRows = rows();
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    method:
      "FRESH_OFFICIAL_INTERNET_SEARCH_PLUS_ISOLATED_HEADLESS_HTML_OR_RENDERED_PDF_PAGE; CAPTURE_REQUIRES_SUBSEQUENT_HUMAN_VISUAL_ACCEPTANCE",
    targetGeos: ["BJN", "BRT", "SCR", "SER", "KAS", "SPI", "PGA"],
    candidateCount: candidates.length,
    capturedCount: currentRows.filter((row) => row.status === "CAPTURED_FOR_HUMAN_VISUAL_REVIEW").length,
    failedCount: currentRows.filter((row) => row.status === "CAPTURE_FAILED").length,
    humanVisualAcceptedCount: currentRows.filter((row) => row.humanVisualVerdict === "ACCEPTED").length,
    outputDirectory: OUTPUT_DIR,
    rows: currentRows,
  };
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

const slot = await acquireProjectProcessSlot(
  "playwright:wiki-project-null-7-visual-capture",
);
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    userAgent: USER_AGENT,
    locale: "en-US",
  });
  const page = await context.newPage();
  for (const candidate of selectedCandidates) {
    const startedAt = new Date().toISOString();
    try {
      const evidence =
        candidate.kind === "pdf"
          ? capturePdf(candidate)
          : await captureHtml(page, candidate);
      rowsById.set(candidate.id, {
        ...candidate,
        startedAt,
        completedAt: new Date().toISOString(),
        status: "CAPTURED_FOR_HUMAN_VISUAL_REVIEW",
        humanVisualVerdict: "PENDING",
        ...evidence,
      });
      console.log(
        `${candidate.id}\tCAPTURED\t${evidence.captureKind}\t${evidence.matchedTerm || "NO_TERM_MATCH"}\t${evidence.screenshotPath}`,
      );
    } catch (error) {
      rowsById.set(candidate.id, {
        ...candidate,
        startedAt,
        completedAt: new Date().toISOString(),
        status: "CAPTURE_FAILED",
        humanVisualVerdict: "NOT_REVIEWABLE",
        error: String(error?.message || error),
      });
      console.log(
        `${candidate.id}\tFAILED\t${String(error?.message || error).split("\n")[0]}`,
      );
    }
    writeReport();
  }
  await context.close();
} finally {
  if (browser) await browser.close();
  await slot.release();
}

writeReport();
console.log(`REPORT=${REPORT_PATH}`);
console.log(`CAPTURED=${rows().filter((row) => row.status === "CAPTURED_FOR_HUMAN_VISUAL_REVIEW").length}`);
console.log(`FAILED=${rows().filter((row) => row.status === "CAPTURE_FAILED").length}`);
