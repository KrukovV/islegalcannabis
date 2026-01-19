import fs from "node:fs";
import path from "node:path";
import { isLawPageFromSnapshot } from "./is_law_page.mjs";

function stripScriptsStylesNav(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ");
}

function normalizeHref(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/&amp;/g, "&");
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function detectLang(html) {
  const match = String(html || "").match(/<html[^>]*lang=["']([^"']+)["']/i);
  return match ? String(match[1] || "").toLowerCase() : "";
}

function detectSpa(html) {
  const value = String(html || "");
  return (
    /id=["']__next["']/i.test(value) ||
    /data-reactroot/i.test(value) ||
    /id=["']app["']/i.test(value) ||
    /ng-version/i.test(value) ||
    /window\.__NUXT__/i.test(value)
  );
}

function getRootDomain(host) {
  const cleaned = String(host || "").toLowerCase().replace(/^www\./, "");
  const parts = cleaned.split(".").filter(Boolean);
  if (parts.length <= 2) return cleaned;
  const suffix = parts[parts.length - 2];
  const needsThird = ["gov", "gouv", "gob", "govt", "go", "gv", "government"].includes(
    suffix
  );
  if (needsThird && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function isSameHost(baseHost, targetHost, allowSubdomains) {
  if (!baseHost || !targetHost) return false;
  if (baseHost === targetHost) return true;
  if (!allowSubdomains) return false;
  const baseRoot = getRootDomain(baseHost);
  const targetRoot = getRootDomain(targetHost);
  if (baseRoot && targetRoot && baseRoot === targetRoot) return true;
  return targetHost.endsWith(`.${baseHost}`);
}

function extractSameHostLinks(html, baseUrl, allowSubdomains = false) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const cleaned = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const matches = cleaned.matchAll(
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  );
  const seen = new Set();
  const results = [];
  for (const match of matches) {
    const hrefRaw = normalizeHref(match[1]);
    if (!hrefRaw || hrefRaw.startsWith("#")) continue;
    if (hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:")) continue;
    let target;
    try {
      target = new URL(hrefRaw, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(target.protocol)) continue;
    if (!isSameHost(base.hostname, target.hostname, allowSubdomains)) continue;
    const cleanUrl = target.href.split("#")[0];
    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);
    const anchorText = String(match[2] || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    results.push({ url: cleanUrl, text: anchorText });
  }
  return results;
}

function scoreLawCandidate(url, text) {
  const target = `${url} ${text}`.toLowerCase();
  const lawTokens = [
    "act",
    "actdetail",
    "actdocumentdetail",
    "/law",
    "/laws",
    "/legislation",
    "/act",
    "/eli",
    "/gazette",
    "/acts",
    "/decree",
    "/ordinance",
    "/bill",
    "/code",
    "/statute",
    "/regulation",
    "/criminal",
    "official journal",
    "official gazette",
    "gazeta zyrtare",
    "gazeta",
    "ligj",
    "ligji",
    "gesetzblatt",
    "loi",
    "ley",
    "legge",
    "gesetz",
    "criminal",
    "penal"
  ];
  const drugTokens = [
    "drug",
    "drugs",
    "narcotics",
    "narcotic",
    "controlled",
    "substance",
    "controlled-substance",
    "controlledsubstance",
    "controlled substances",
    "controlled-substances",
    "controlled drugs",
    "controlled-drugs",
    "drug control",
    "drug-control",
    "drugcontrol",
    "drug law",
    "drug-law",
    "druglaw",
    "narcotic drugs",
    "narcotics control",
    "narcotics-control",
    "misuse of drugs",
    "misuse-of-drugs",
    "psychotropic substances",
    "psychotropic-substances",
    "controlled substances act",
    "psychotropic",
    "cannabis",
    "hemp",
    "cannabinoid",
    "cannabinoids",
    "cbd",
    "thc",
    "tetrahydrocannabinol",
    "тгк",
    "kanabis",
    "marihuan",
    "hashash",
    "narkotik"
  ];
  const denyTokens = [
    "news",
    "press",
    "blog",
    "map",
    "forum",
    "social",
    "tourism",
    "cookie",
    "privacy",
    "facebook",
    "twitter"
  ];
  for (const token of denyTokens) {
    if (target.includes(token)) return -1;
  }
  let score = 0;
  let lawScore = 0;
  let drugScore = 0;
  for (const token of lawTokens) {
    if (target.includes(token)) {
      score += 2;
      lawScore += 1;
    }
  }
  for (const token of drugTokens) {
    if (target.includes(token)) {
      score += 2;
      drugScore += 1;
    }
  }
  if (target.includes(".pdf")) score += 1;
  if (lawScore === 0) return -1;
  if (drugScore === 0) score = Math.max(1, lawScore);
  return score;
}

function deriveLegalEntrypoints(html, baseUrl, limit = 10, allowSubdomains = false) {
  const tokens = [
    "justice",
    "legislation",
    "gazette",
    "parliament",
    "assembly",
    "senate",
    "ministry",
    "health",
    "drug",
    "narcotic"
  ];
  const links = extractSameHostLinks(html, baseUrl, allowSubdomains);
  const results = [];
  for (const link of links) {
    const target = `${link.url} ${link.text}`.toLowerCase();
    const hit = tokens.find((token) => target.includes(token));
    if (!hit) continue;
    results.push({ from: baseUrl, to: link.url, why: `keyword:${hit}` });
    if (results.length >= limit) break;
  }
  return results;
}

function collectLawCandidates(html, baseUrl, limit = 50, allowSubdomains = false) {
  const links = extractSameHostLinks(html, baseUrl, allowSubdomains);
  return links
    .map((link) => ({
      url: link.url,
      text: link.text,
      score: scoreLawCandidate(link.url, link.text)
    }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function classifyCandidateHeuristic(url, title, snippet) {
  const text = `${url} ${title} ${snippet}`.toLowerCase();
  const tokens = [
    "cannabis",
    "marijuana",
    "marihuana",
    "hemp",
    "cannabidiol",
    "cbd",
    "thc",
    "tetrahydrocannabinol",
    "тгк",
    "kanabis",
    "marihuan",
    "hashash",
    "narkotik",
    "medical cannabis",
    "medicinal cannabis",
    "cannabis act",
    "narcotic drugs",
    "controlled substances",
    "dronabinol",
    "nabiximols",
    "sativex",
    "epidiolex",
    "cannabis medicinal",
    "estupefacientes",
    "cannabis médical",
    "stupéfiants",
    "cannabisgesetz",
    "betäubungsmittel",
    "entorpecentes",
    "cannabis terapeutica",
    "stupefacenti"
  ];
  const hits = tokens.filter((token) => text.includes(token));
  return {
    likely: hits.length > 0,
    reason: hits.length > 0 ? "token_match" : "no_match",
    keywords: hits.slice(0, 3)
  };
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalizeText(stripHtml(match[1] || "")) : "";
}

function extractSnippet(html, maxLength = 2000) {
  const cleaned = stripScriptsStylesNav(html);
  const text = normalizeText(stripHtml(cleaned));
  return text.slice(0, maxLength);
}

export async function discoverLawPage({
  iso2,
  baseUrl,
  snapshot,
  fetchSnapshot,
  timeoutMs = 10000,
  retries = 1,
  maxPages = 30,
  traceIso = "",
  traceDir = "",
  seedUrls = [],
  allowSubdomains = false
}) {
  const snapshotPath = snapshot?.snapshotPath || "";
  if (!snapshotPath) {
    return { ok: false, reason: "SNAPSHOT_MISSING", entrypoints: [] };
  }
  let html = "";
  try {
    if (snapshotPath.endsWith(".html")) {
      html = fs.readFileSync(snapshotPath, "utf8");
    }
  } catch {
    html = "";
  }
  if (traceIso && traceIso === String(iso2 || "").toUpperCase()) {
    const links = html ? extractSameHostLinks(html, baseUrl, allowSubdomains) : [];
    const topLinks = links
      .map((item) => ({
        url: item.url,
        text: item.text,
        score: scoreLawCandidate(item.url, item.text)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    const tracePayload = {
      iso2: String(iso2 || "").toUpperCase(),
      start_url: baseUrl,
      final_url: snapshot?.finalUrl || baseUrl,
      content_type: snapshot?.contentType || "unknown",
      detected_lang: detectLang(html),
      is_spa: detectSpa(html),
      found_links_count: links.length,
      top_links: topLinks,
      pages_scanned: 0
    };
    if (traceDir) {
      fs.mkdirSync(traceDir, { recursive: true });
      fs.writeFileSync(
        path.join(traceDir, `${String(iso2 || "").toLowerCase()}_trace.json`),
        JSON.stringify(tracePayload, null, 2) + "\n"
      );
    }
  }

  const baseProbe = isLawPageFromSnapshot(snapshotPath, baseUrl);
  if (baseProbe.ok) {
    return {
      ok: true,
      url: baseUrl,
      snapshotPath,
      score: 0,
      contentHash: snapshot.contentHash || "",
      status: snapshot.status || 0,
      entrypoints: [],
      markers: {
        law_marker_found: Boolean(baseProbe.law_marker_found),
        cannabis_marker_found: Boolean(baseProbe.cannabis_marker_found)
      },
      reason: baseProbe.reason || "OK",
      candidates: [],
      llm_votes: [],
      ocr_ran: Boolean(baseProbe.ocr_ran),
      ocr_text_len: Number(baseProbe.ocr_text_len || 0) || 0
    };
  }
  if (!snapshotPath.endsWith(".html")) {
    return { ok: false, reason: baseProbe.reason || "NOT_LAW_PAGE", entrypoints: [] };
  }
  if (!html) {
    return { ok: false, reason: "EMPTY_HTML", entrypoints: [] };
  }

  const entrypoints = deriveLegalEntrypoints(html, baseUrl, 10, allowSubdomains);
  const candidates = collectLawCandidates(html, baseUrl, 40, allowSubdomains);
  const seedList = Array.isArray(seedUrls)
    ? seedUrls
      .filter((url) => typeof url === "string" && url.trim())
      .map((url) => ({ url, text: "seed", score: 8, entrypoint: null }))
    : [];
  const prioritized = [
    ...entrypoints.map((entry) => ({
      url: entry.to,
      text: entry.why,
      score: 6,
      entrypoint: entry
    })),
    ...seedList,
    ...candidates.map((item) => ({ ...item, entrypoint: null }))
  ];

  const seen = new Set(candidates.map((item) => item.url));
  const fallback = [];
  const llmVotes = [];
  let pagesScanned = 0;

  const scanList = prioritized.slice(0, 10);
  for (const candidate of scanList) {
    const candidateUrl = candidate.url;
    if (!candidateUrl.startsWith("https://")) continue;
    if (pagesScanned >= maxPages) break;
    const snapshotCandidate = await fetchSnapshot(iso2, candidateUrl, {
      timeoutMs,
      retries
    });
    pagesScanned += 1;
    if (!snapshotCandidate?.ok || !snapshotCandidate.snapshotPath) continue;

    let candidateHtml = "";
    if (snapshotCandidate.snapshotPath.endsWith(".html")) {
      try {
        candidateHtml = fs.readFileSync(snapshotCandidate.snapshotPath, "utf8");
      } catch {
        candidateHtml = "";
      }
    }

    const title = candidateHtml ? extractTitle(candidateHtml) : "";
    const snippet = candidateHtml ? extractSnippet(candidateHtml) : "";
    const llm = classifyCandidateHeuristic(candidateUrl, title, snippet);
    llmVotes.push({
      url: candidateUrl,
      verdict: llm.likely ? "yes" : "no",
      reason: llm.reason,
      keywords: llm.keywords
    });

    const probe = isLawPageFromSnapshot(snapshotCandidate.snapshotPath, candidateUrl);
    if (probe.ok) {
      if (traceIso && traceIso === String(iso2 || "").toUpperCase() && traceDir) {
        const tracePath = path.join(
          traceDir,
          `${String(iso2 || "").toLowerCase()}_trace.json`
        );
        if (fs.existsSync(tracePath)) {
          const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
          trace.pages_scanned = pagesScanned;
          fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2) + "\n");
        }
      }
      return {
        ok: true,
        url: candidateUrl,
        snapshotPath: snapshotCandidate.snapshotPath,
        score: candidate.score,
        contentHash: snapshotCandidate.contentHash || "",
        status: snapshotCandidate.status || 0,
        entrypoints,
        markers: {
          law_marker_found: Boolean(probe.law_marker_found),
          cannabis_marker_found: Boolean(probe.cannabis_marker_found)
        },
        reason: probe.reason || "OK",
        candidates,
        llm_votes: llmVotes,
        ocr_ran: Boolean(probe.ocr_ran),
        ocr_text_len: Number(probe.ocr_text_len || 0) || 0,
        pages_scanned: pagesScanned
      };
    }

    if (snapshotCandidate.snapshotPath.endsWith(".html")) {
      try {
        const nestedHtml = fs.readFileSync(snapshotCandidate.snapshotPath, "utf8");
        const nested = collectLawCandidates(nestedHtml, candidateUrl, 20, allowSubdomains);
        for (const item of nested) {
          if (seen.has(item.url)) continue;
          seen.add(item.url);
          fallback.push(item);
          if (fallback.length >= 40) break;
        }
      } catch {
        // ignore nested crawl errors
      }
    }
  }

  const fallbackTop = fallback.sort((a, b) => b.score - a.score).slice(0, 10);
  for (const candidate of fallbackTop) {
    const candidateUrl = candidate.url;
    if (!candidateUrl.startsWith("https://")) continue;
    if (pagesScanned >= maxPages) break;
    const snapshotCandidate = await fetchSnapshot(iso2, candidateUrl, {
      timeoutMs,
      retries
    });
    pagesScanned += 1;
    if (!snapshotCandidate?.ok || !snapshotCandidate.snapshotPath) continue;

    let candidateHtml = "";
    if (snapshotCandidate.snapshotPath.endsWith(".html")) {
      try {
        candidateHtml = fs.readFileSync(snapshotCandidate.snapshotPath, "utf8");
      } catch {
        candidateHtml = "";
      }
    }

    const title = candidateHtml ? extractTitle(candidateHtml) : "";
    const snippet = candidateHtml ? extractSnippet(candidateHtml) : "";
    const llm = classifyCandidateHeuristic(candidateUrl, title, snippet);
    llmVotes.push({
      url: candidateUrl,
      verdict: llm.likely ? "yes" : "no",
      reason: llm.reason,
      keywords: llm.keywords
    });

    const probe = isLawPageFromSnapshot(snapshotCandidate.snapshotPath, candidateUrl);
    if (probe.ok) {
      if (traceIso && traceIso === String(iso2 || "").toUpperCase() && traceDir) {
        const tracePath = path.join(
          traceDir,
          `${String(iso2 || "").toLowerCase()}_trace.json`
        );
        if (fs.existsSync(tracePath)) {
          const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
          trace.pages_scanned = pagesScanned;
          fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2) + "\n");
        }
      }
      return {
        ok: true,
        url: candidateUrl,
        snapshotPath: snapshotCandidate.snapshotPath,
        score: candidate.score,
        contentHash: snapshotCandidate.contentHash || "",
        status: snapshotCandidate.status || 0,
        entrypoints,
        markers: {
          law_marker_found: Boolean(probe.law_marker_found),
          cannabis_marker_found: Boolean(probe.cannabis_marker_found)
        },
        reason: probe.reason || "OK",
        candidates,
        llm_votes: llmVotes,
        ocr_ran: Boolean(probe.ocr_ran),
        ocr_text_len: Number(probe.ocr_text_len || 0) || 0,
        pages_scanned: pagesScanned
      };
    }
  }

  if (traceIso && traceIso === String(iso2 || "").toUpperCase() && traceDir) {
    const tracePath = path.join(
      traceDir,
      `${String(iso2 || "").toLowerCase()}_trace.json`
    );
    if (fs.existsSync(tracePath)) {
      const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
      trace.pages_scanned = pagesScanned;
      fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2) + "\n");
    }
  }

  return {
    ok: false,
    reason: "NO_LAW_PAGE",
    entrypoints,
    candidates,
    llm_votes: llmVotes,
    ocr_ran: false,
    ocr_text_len: 0,
    pages_scanned: pagesScanned
  };
}
