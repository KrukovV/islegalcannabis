#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { acquireProjectProcessSlot } from "../runtime/processSlots.mjs";

const ROOT = process.cwd();
const OUT = path.join(os.homedir(), "islegalcannabis_archive", "cannabis-law-screenshots", "grey-39-current");
const TMP = path.join(os.tmpdir(), "islegal-grey-39-current");
const REPORT = path.join(ROOT, "data", "reviews", "wiki-truth-grey-39-fresh-visual-captures.json");
const UA = "islegalcannabis-manual-visual-audit/1.0";

const candidates = [
  ["AL", "https://nacc.gov.al/en/faq/", ["not legalise", "cannabis", "Law no. 61/2023"]],
  ["AQ", "https://www.ats.aq/devAS/Ats/NationalCompetentAuthorities?lang=e", ["national legislation", "National Competent Authorities", "permit"]],
  ["AM", "https://arlis.am/en/acts/216352", ["44.1", "44.2", "hemp", "narcotic"]],
  ["AZ", "https://frameworks.e-qanun.az/10/c_f_10675.html", ["çətənə", "kannabis", "narkotik"]],
  ["BJN", "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=80394", ["cannabis", "fines medicinales", "ARTÍCULO 3"]],
  ["BRT", "https://sdgs.un.org/partnerships/new-kush", ["Bir Tawil", "New Kush", "unclaimed"]],
  ["BV", "https://lovdata.no/dokument/NL/lov/1930-02-27-3", ["Bouvetøya", "biland", "strafferett"]],
  ["BF", "https://www.an.bf/storage/Loi/n53UNiWibGu7dOfkIqc0pgYQpwb51QUX0rDJsCvg.pdf", ["Article 385-2", "huile de cannabis", "dérivé de la plante de cannabis"]],
  ["CM", "http://www.minjustice.gov.cm/index.php/fr/textes-lois/lois/download/128/351/18?method=view", ["cannabis", "Tableau I", "sans intérêt médical"]],
  ["TD", "https://www.unodc.org/cld/uploads/res/document/tcd/loi-no-24_html/loi_no_24.pdf", ["cannabis", "stupéfiants", "usage"]],
  ["DJ", "https://www.journalofficiel.dj/texte-juridique/decret-n2003-0202-pre-portant-reglementation-des-activites-economiques-des-zones-franches-a-djibouti/", ["cannabis", "hachish", "chanvre indien"]],
  ["DM", "https://dominica.gov.dm/laws/2020/Drug%20Prevention%20%28Amendment%29%20Act%202020.pdf", ["twenty-eight grammes", "three plants", "cannabis"]],
  ["ET", "https://www.efda.gov.et/wp-content/uploads/2019/03/Ethiopia_National-Drug-Control-Master-Plan-2017.pdf", ["cannabis", "main psychoactive substances", "illicit"]],
  ["FR", "https://drogues-info-service.fr/content/view/pdf/19975", ["cannabis", "L.3421-1", "amende forfaitaire"]],
  ["PF", "https://www.service-public.pf/dgae/wp-content/uploads/sites/44/2025/07/CBD.pdf", ["cannabis", "0,30", "Loi du pays"]],
  ["TF", "https://taaf.fr/collectivites/le-prefet-administrateur-superieur/", ["exécution des lois", "règlements", "TAAF"]],
  ["GD", "https://mail.cannabiscommission.gov.gd/faqs", ["Formal commencement", "Until then", "existing cannabis laws"]],
  ["US-IN", "https://www.cityoffortwayne.in.gov/CivicAlerts.aspx?AID=265", ["Possession of Marijuana", "Class B misdemeanor", "Class A misdemeanor"]],
  ["US-IA", "https://www.legis.iowa.gov/law/iowaCode/sections?codeChapter=124E", ["medical cannabidiol", "marijuana", "unlawful possession"]],
  ["IM", "https://legislation.gov.im/cms/images/LEGISLATION/PRINCIPAL/1976/1976-0021/1976-0021.pdf", ["Restriction of cultivation of cannabis plant", "cannabis-based product for medicinal use", "cannabis"]],
  ["LV", "https://likumi.lv/ta/en/en/id/40283-law-on-the-legal-trade-of-narcotic-and-psychotropic-substances-and-medicinal-products-and-also-precursors", ["cannabis", "hemp", "cultivation"]],
  ["LS", "https://lndc.org.ls/medicinal-cannabis/", ["Medicinal Cannabis", "2018", "licence"]],
  ["MO", "https://www.pj.gov.mo/Web/Policia/law0102/20220110/13093.html", ["大麻", "cannabis", "種植"]],
  ["MS", "https://www.gov.ms/wp-content/uploads/2026/02/4.07-Drugs-Prevention-of-Misuse-Act.pdf", ["Restriction or cultivation of cannabis plant", "research", "cannabis"]],
  ["KP", "https://www.unilaw.go.kr/bbs/selectBoardArticle.do?alike=&alikeYn=&authFlag=Y&bbsAttrbCode=BBSA02&bbsId=BBSMSTR_000000000021&bbsSubId=&bbsTyCode=BBST01&menuNo=3010000&nttId=112&pageIndex=3&passwordConfirmAt=&recordCountPerPage=10&searchCnd=&searchWrd=&sidx=NTT_ID&sord=DESC&upperMenuId=3000000", ["North Korea", "DPRK", "법령"]],
  ["PN", "https://www.government.pn/laws", ["Laws of Pitcairn", "law", "Ordinances"]],
  ["BL", "https://www.saint-barth-saint-martin.gouv.fr/Actualites/Appel-a-Projets/APPEL-A-PROJET-2026-MILDECA", ["cannabis", "nos territoires", "stupéfiants"]],
  ["MF", "https://www.saint-barth-saint-martin.gouv.fr/Actualites/Appel-a-Projets/APPEL-A-PROJET-2026-MILDECA", ["cannabis", "nos territoires", "stupéfiants"]],
  ["PM", "https://www.saint-pierre-et-miquelon.gouv.fr/Actions-de-l-Etat/Securite/Fonds-interministeriel-de-prevention-de-la-delinquance-FIPD-2026", ["stupéfiants", "trafic", "consommation"]],
  ["SCR", "https://lawphil.net/statutes/repacts/ra2002/ra_9165_2002.html", ["Cannabis", "Marijuana", "Indian Hemp"]],
  ["SER", "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=80394", ["cannabis", "fines medicinales", "ARTÍCULO 3"]],
  ["KAS", "https://www.indiacode.nic.in/bitstream/123456789/18974/1/narcotic-drugs-and-psychotropic-substances-act-1985.pdf", ["cannabis (hemp)", "charas", "ganja"]],
  ["SPI", "https://www.argentina.gob.ar/normativa/nacional/ley-27350-273801/actualizacion", ["cannabis", "uso medicinal", "ARTÍCULO 1"]],
  ["PGA", "https://lawphil.net/statutes/repacts/ra2002/ra_9165_2002.html", ["Cannabis", "Marijuana", "Indian Hemp"]],
  ["SJ", "https://lovdata.no/dokument/NL/lov/1930-02-27-2", ["Jan Mayen", "straffelov", "norsk"]],
  ["SY", "https://sana.sy/presidency/2407527/", ["قانون مكافحة المخدرات رقم /2/ لعام 1993", "المخدرات", "المادة /43/"]],
  ["TK", "https://www.paclii.org/tk/legis/consol_act_2016/cpaer2003302.pdf", ["cannabis plant or seed", "written prescription", "49 Drugs"]],
  ["UZ", "https://lex.uz/pdffile/4025388", ["каннабис", "марихуана", "гашиш"]],
  ["VE", "https://sherloc.unodc.org/cld/uploads/res/document/ven/ley-drogas_html/Venezuela_Ley_Organzia_De_Drogas_R-10-92.pdf", ["marihuana", "dosis personal", "Artículo 131"]]
].map(([geo, url, terms]) => ({ geo, url, terms }));

const onlyGeos = new Set(String(process.env.GEOS || "").split(",").map((item) => item.trim()).filter(Boolean));
const selectedCandidates = onlyGeos.size ? candidates.filter((candidate) => onlyGeos.has(candidate.geo)) : candidates;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

function sh(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
}

function findPdfPage(pdfPath, terms) {
  const info = sh("pdfinfo", [pdfPath]);
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
  for (const term of terms) {
    for (let page = 1; page <= pages; page += 1) {
      let text = "";
      try {
        text = sh("pdftotext", ["-f", String(page), "-l", String(page), "-layout", pdfPath, "-"]);
      } catch {}
      if (text.toLocaleLowerCase().includes(term.toLocaleLowerCase())) {
        return { pages, match: { page, term, text: text.trim().slice(0, 1600) } };
      }
    }
  }
  return { pages, match: null };
}

async function capturePdf(candidate) {
  const pdfPath = path.join(TMP, `${candidate.geo}.pdf`);
  sh("curl", ["-L", "--fail", "--compressed", "--max-time", "90", "-A", UA, "-o", pdfPath, candidate.url]);
  const found = findPdfPage(pdfPath, candidate.terms);
  const page = found.match?.page || 1;
  const base = path.join(TMP, `${candidate.geo}-page`);
  sh("pdftoppm", ["-f", String(page), "-l", String(page), "-singlefile", "-jpeg", "-jpegopt", "quality=78", "-r", "125", pdfPath, base]);
  const screenshotPath = path.join(OUT, `${candidate.geo}.jpg`);
  fs.copyFileSync(`${base}.jpg`, screenshotPath);
  return {
    kind: "PDF_RENDER",
    page,
    pageCount: found.pages,
    matchedTerm: found.match?.term || null,
    textExcerpt: found.match?.text || null,
    screenshotPath,
    screenshotBytes: fs.statSync(screenshotPath).size
  };
}

async function captureHtml(page, candidate) {
  const response = await page.goto(candidate.url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);
  if (candidate.geo === "AL") {
    await page.getByText("Is the use of cannabis legalised", { exact: false }).click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => {
    for (const selector of ["#cookie-law-info-bar", ".cli-modal", ".cli-modal-backdrop", ".cookie-notice", "[class*='cookie-banner']"]) {
      document.querySelectorAll(selector).forEach((element) => element.remove());
    }
  });
  const result = await page.evaluate((terms) => {
    const foldedTerms = terms.map((term) => term.toLocaleLowerCase());
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const value = String(node.nodeValue || "").replace(/\s+/g, " ").trim();
      if (!value) continue;
      const folded = value.toLocaleLowerCase();
      const index = foldedTerms.findIndex((term) => folded.includes(term));
      const element = node.parentElement;
      const rect = element?.getBoundingClientRect();
      const style = element ? getComputedStyle(element) : null;
      const visible = Boolean(rect && rect.width > 0 && rect.height > 0 && style?.display !== "none" && style?.visibility !== "hidden");
      if (index >= 0 && visible) {
        element?.scrollIntoView({ block: "center", inline: "nearest" });
        return { term: terms[index], text: value.slice(0, 1200), tag: element?.tagName || null };
      }
    }
    return { term: null, text: document.body.innerText.replace(/\s+/g, " ").slice(0, 1200), tag: null };
  }, candidate.terms);
  await page.waitForTimeout(500);
  await page.evaluate(({ geo, url, term }) => {
    document.getElementById("islegal-visual-proof-banner")?.remove();
    const banner = document.createElement("div");
    banner.id = "islegal-visual-proof-banner";
    banner.textContent = `${geo} | ${term || "NO_TERM_MATCH"} | ${url}`;
    Object.assign(banner.style, {
      position: "fixed", top: "0", left: "0", right: "0", zIndex: "2147483647",
      background: "#111827", color: "white", padding: "8px 12px", font: "14px/1.35 monospace",
      borderBottom: "3px solid #22c55e", overflow: "hidden", whiteSpace: "nowrap"
    });
    document.documentElement.appendChild(banner);
  }, { geo: candidate.geo, url: candidate.url, term: result.term });
  const screenshotPath = path.join(OUT, `${candidate.geo}.jpg`);
  await page.screenshot({ path: screenshotPath, type: "jpeg", quality: 76, fullPage: false });
  return {
    kind: "HEADLESS_HTML_VIEWPORT",
    httpStatus: response?.status() || null,
    finalUrl: page.url(),
    title: await page.title(),
    matchedTerm: result.term,
    textExcerpt: result.text,
    screenshotPath,
    screenshotBytes: fs.statSync(screenshotPath).size
  };
}

const rows = [];
const slot = await acquireProjectProcessSlot("playwright:wiki-grey-39-visual-capture");
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, userAgent: UA, locale: "en-US" });
  const page = await context.newPage();
  for (const candidate of selectedCandidates) {
    const startedAt = new Date().toISOString();
    try {
      const response = await fetch(candidate.url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(30000), headers: { "user-agent": UA } }).catch(() => null);
      const contentType = response?.headers.get("content-type") || "";
      const looksPdf = contentType.includes("pdf") || /\.pdf(?:$|[?#])|pdffile\//i.test(candidate.url);
      const evidence = looksPdf ? await capturePdf(candidate) : await captureHtml(page, candidate);
      rows.push({ ...candidate, startedAt, completedAt: new Date().toISOString(), status: "CAPTURED_FOR_HUMAN_VISUAL_REVIEW", ...evidence });
      console.log(`${candidate.geo}\tCAPTURED\t${evidence.kind}\t${evidence.matchedTerm || "NO_TERM_MATCH"}\t${evidence.screenshotPath}`);
    } catch (error) {
      rows.push({ ...candidate, startedAt, completedAt: new Date().toISOString(), status: "CAPTURE_FAILED", error: String(error?.message || error) });
      console.log(`${candidate.geo}\tFAILED\t${String(error?.message || error).split("\n")[0]}`);
    }
  }
} finally {
  if (browser) await browser.close();
  await slot.release();
}

const previousRows = onlyGeos.size && fs.existsSync(REPORT)
  ? JSON.parse(fs.readFileSync(REPORT, "utf8")).rows.filter((row) => !onlyGeos.has(row.geo))
  : [];
const mergedRows = [...previousRows, ...rows].sort((a, b) => a.geo.localeCompare(b.geo));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  method: "ISOLATED_HEADLESS_HTML_OR_RENDERED_PDF_PAGE; CAPTURE_IS_NOT_ACCEPTANCE_UNTIL_HUMAN_VISUAL_REVIEW",
  sourceGreyCount: candidates.length,
  selectedCount: selectedCandidates.length,
  capturedCount: mergedRows.filter((row) => row.status === "CAPTURED_FOR_HUMAN_VISUAL_REVIEW").length,
  failedCount: mergedRows.filter((row) => row.status === "CAPTURE_FAILED").length,
  outputDirectory: OUT,
  rows: mergedRows
};
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`REPORT=${REPORT}`);
console.log(`CAPTURED=${report.capturedCount}`);
console.log(`FAILED=${report.failedCount}`);
