#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prodAuditDir = path.join(repoRoot, "Reports", "ProdAudit");
const perfDir = path.join(repoRoot, "Reports", "Perf");
const campaignPath = path.join(prodAuditDir, "nightly-campaign.json");
const repeatabilityPath = path.join(prodAuditDir, "repeatability-nightly.md");
const performancePath = path.join(perfDir, "prod-performance.json");

const rotationPool = ["XK", "GF", "TW", "HK", "MO", "PS", "EH", "PR"];

async function readJson(filePath) {
  return fs.readFile(filePath, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => null);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

function firstCycle(summary) {
  return Array.isArray(summary?.cycles) ? summary.cycles[0] || null : null;
}

function networkEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.requests)) return payload.requests;
  return [];
}

function headerValue(headers, name) {
  const lower = name.toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === lower);
  return entry?.[1] || "";
}

function isChallengeEvent(event) {
  const status = Number(event.status ?? event.response_status ?? event.response?.status ?? 0);
  const headers = event.headers || event.response_headers || event.response?.headers_object || {};
  return status === 403 || String(headerValue(headers, "x-vercel-mitigated")).toLowerCase() === "challenge";
}

function challengeBucket(event) {
  const url = String(event.url || "");
  const type = String(event.resource_type || event.type || event.resourceType || "").toLowerCase();
  if (/\/api\/new-map\/card-index\b/.test(url)) return "CARD_INDEX";
  if (/glyph/i.test(url)) return "GLYPHS";
  if (/sprite/i.test(url)) return "SPRITES";
  if (/basemap|tile|tiles/i.test(url)) return "TILES";
  if (/\/api\//.test(url)) return "API";
  if (/\/_next\/static\/chunks\/.*\.js\b/.test(url) || type === "script") return "JS_CHUNK";
  if (type === "document") return "HTML";
  return "OTHER";
}

function summarizeChallenges(events) {
  const challenged = events.filter(isChallengeEvent);
  const buckets = {};
  for (const event of challenged) {
    const bucket = challengeBucket(event);
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  return {
    FIRST_SUBRESOURCE_CHALLENGE: challenged[0]?.url || "",
    CHALLENGE_COUNT: challenged.length,
    CHALLENGED_URLS: challenged.map((event) => event.url).filter(Boolean),
    CHALLENGED_TYPES: Object.keys(buckets),
    CHALLENGE_BUCKETS: buckets
  };
}

function rowByGeo(rows) {
  return Object.fromEntries((rows || []).map((row) => [String(row.geo || row.id || "").toUpperCase(), row]));
}

function rotatedCampaignGeos(index) {
  const offset = index % rotationPool.length;
  return Array.from({ length: 4 }, (_, i) => rotationPool[(offset + i) % rotationPool.length]);
}

async function copyCampaignScreenshots(summary, reportDir, runIndex) {
  const cycle = firstCycle(summary);
  const rows = rowByGeo(cycle?.territory_matrix || []);
  const selected = rotatedCampaignGeos(runIndex);
  const screenshots = [];
  for (let index = 0; index < selected.length; index += 1) {
    const geo = selected[index];
    const row = rows[geo] || null;
    const sourceRel = row?.screenshots?.popup || row?.screenshot_path || "";
    const sourcePath = sourceRel ? path.join(repoRoot, sourceRel) : "";
    const targetPath = path.join(reportDir, `country-${index + 1}.png`);
    const sourceExists = sourcePath ? await fs.stat(sourcePath).then((stat) => stat.isFile()).catch(() => false) : false;
    if (sourceExists) {
      await fs.copyFile(sourcePath, targetPath);
      screenshots.push({
        slot: index + 1,
        geo,
        source: sourceRel,
        path: rel(targetPath),
        copied: true
      });
    } else {
      screenshots.push({
        slot: index + 1,
        geo,
        source: sourceRel,
        path: "",
        copied: false
      });
    }
  }
  return screenshots;
}

function runResult(summary, challenge) {
  const status = String(summary?.status || "UNKNOWN");
  const stopReason = String(summary?.stop_reason || "");
  if (status === "PASS") return "PASS";
  if (stopReason) return `${status}:${stopReason}`;
  if (challenge.CHALLENGE_COUNT > 0) return `${status}:SUBRESOURCE_CHALLENGE`;
  return status;
}

function timing(summary) {
  const cycle = firstCycle(summary);
  const homeTotal = cycle?.home?.timings?.total_ms ?? null;
  const mapTotal = cycle?.new_map?.timings?.total_ms ?? null;
  const mapReady = cycle?.new_map?.timings?.map_ready_ms ?? null;
  const clickRows = (cycle?.territory_matrix || []).filter((row) => Number.isFinite(Number(row.click_to_popup_ms)));
  const seoRows = (cycle?.seo_flow?.rows || []).filter((row) => Number.isFinite(Number(row.SEO_PAGE_MS)));
  const seoTotal = seoRows.reduce((sum, row) => sum + Number(row.SEO_PAGE_MS || 0), 0);
  return {
    SEED_TO_HOMEPAGE_MS: homeTotal,
    HOMEPAGE_TO_MAP_MS: mapTotal,
    MAP_READY_MS: mapReady,
    CLICK_TO_POPUP_MS: clickRows.length
      ? Math.round(clickRows.reduce((sum, row) => sum + Number(row.click_to_popup_ms), 0) / clickRows.length)
      : null,
    SEO_READY_MS: seoRows.length ? Math.round(seoTotal / seoRows.length) : null,
    FULL_RUN_MS: Number(homeTotal || 0) + Number(mapTotal || 0) + Number(seoTotal || 0),
    POPUP_SAMPLE_COUNT: clickRows.length
  };
}

function stabilityParts(summary, challenge) {
  const cycle = firstCycle(summary);
  const popupVisible = Boolean(cycle?.territory_matrix?.some((row) => row.popup_visible === true));
  return {
    APP_CODE_REACHED: summary?.APP_CODE_REACHED === "YES",
    MAP_READY: Boolean(cycle?.new_map?.map_ready),
    POPUP_VISIBLE: popupVisible,
    SEO_FLOW_COMPLETED: Boolean(summary?.seo_flow_pass || cycle?.seo_flow?.pass),
    SCREENSHOT_ANALYSIS: Boolean(summary?.screenshot_analysis_pass),
    MAP_STABILITY: Boolean(summary?.map_stability_pass || cycle?.map_stability?.pass),
    GEOLOCATION: Boolean(summary?.geolocation_pass || cycle?.geolocation?.RESULT === "PASS"),
    NO_SUBRESOURCE_CHALLENGE: challenge.CHALLENGE_COUNT === 0,
    NO_CLIENT_EXCEPTION: !/CLIENT_EXCEPTION|PAGE_ERROR/i.test(JSON.stringify(summary || {}))
  };
}

function stabilityScore(parts) {
  return Object.values(parts).filter(Boolean).length;
}

function isRealProdAttemptRow(row) {
  if (!row) return false;
  if (String(row.STOP_REASON || "") === "PROD_RUN_FORBIDDEN") return false;
  if (/PROD_RUN_FORBIDDEN/.test(String(row.RESULT_DETAIL || ""))) return false;
  return row.SEED_STATUS !== null && row.SEED_STATUS !== undefined;
}

async function collectRun(entry, index) {
  const summaryPath = path.join(prodAuditDir, entry.name, "summary.json");
  const summary = await readJson(summaryPath);
  if (!summary) return null;
  if (summary.stop_reason === "PROD_RUN_FORBIDDEN" || Number(summary.seed_request_count || 0) === 0) return null;
  const reportDir = path.join(prodAuditDir, entry.name);
  const network = networkEvents(await readJson(path.join(reportDir, "network.json")));
  const challenge = summarizeChallenges(network);
  const cycle = firstCycle(summary);
  const rows = Array.isArray(cycle?.territory_matrix) ? cycle.territory_matrix : [];
  const popupFlowStarted = rows.length > 0 || Boolean(cycle?.kosovo || cycle?.french_guiana);
  const popupFlowCompleted = Boolean(summary.territory_matrix_pass || (cycle?.kosovo?.status === "PASS" && cycle?.french_guiana?.status === "PASS"));
  const seoFlowCompleted = Boolean(summary.seo_flow_pass || cycle?.seo_flow?.pass);
  const seedChallenge = summary.stop_reason === "SEED_CHALLENGE" || summary.seed_response_mitigated === "challenge";
  const parts = stabilityParts(summary, challenge);
  const countryScreenshots = await copyCampaignScreenshots(summary, reportDir, index);
  return {
    RUN_ID: summary.run_id || entry.name,
    TIMESTAMP: summary.generated_at || "",
    HOST: summary.locked_host || "",
    SEED_STATUS: summary.seed_response_status ?? null,
    SEED_CHALLENGE: Boolean(seedChallenge),
    SUBRESOURCE_CHALLENGE_COUNT: challenge.CHALLENGE_COUNT,
    ...challenge,
    APP_CODE_REACHED: summary.APP_CODE_REACHED || "NO",
    MAP_READY: cycle?.new_map?.map_ready ? "YES" : "NO",
    POPUP_FLOW_STARTED: popupFlowStarted ? "YES" : "NO",
    POPUP_FLOW_COMPLETED: popupFlowCompleted ? "YES" : "NO",
    SEO_FLOW_COMPLETED: seoFlowCompleted ? "YES" : "NO",
    SCREENSHOT_ANALYSIS: summary.screenshot_analysis_pass ? "PASS" : "FAIL",
    MAP_STABILITY: summary.map_stability_pass ? "PASS" : "FAIL",
    GEOLOCATION: summary.geolocation_pass ? "PASS" : "FAIL",
    COUNTRY_SCREENSHOTS: countryScreenshots,
    RESULT: summary.status === "PASS" ? "PASS" : "FAIL",
    RESULT_DETAIL: runResult(summary, challenge),
    STOP_REASON: summary.stop_reason || "",
    STABILITY_SCORE: stabilityScore(parts),
    STABILITY_PARTS: parts,
    REPORT_DIR: rel(reportDir)
  };
}

function rate(runs, predicate) {
  if (!runs.length) return 0;
  return runs.filter(predicate).length / runs.length;
}

function renderRepeatability(runs, aggregate) {
  const lines = [
    "# Production Repeatability Nightly",
    "",
    "| RUN | SEED | SUBRESOURCE | MAP | POPUP | SEO | RESULT |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const run of runs) {
    const subresource = run.SUBRESOURCE_CHALLENGE_COUNT
      ? `${run.SUBRESOURCE_CHALLENGE_COUNT} ${run.CHALLENGED_TYPES.join(",")}`
      : "0";
    lines.push(`| ${run.RUN_ID} | ${run.SEED_STATUS ?? "ERR"} | ${subresource} | ${run.MAP_READY} | ${run.POPUP_FLOW_COMPLETED} | ${run.SEO_FLOW_COMPLETED || "NO"} | ${run.RESULT_DETAIL} |`);
  }
  lines.push("");
  lines.push(`TOTAL_RUNS=${aggregate.total_runs}`);
  lines.push(`SEED_CHALLENGE_RATE=${aggregate.seed_challenge_rate}`);
  lines.push(`SUBRESOURCE_CHALLENGE_RATE=${aggregate.subresource_challenge_rate}`);
  lines.push(`APP_CODE_SUCCESS_RATE=${aggregate.app_code_success_rate}`);
  lines.push(`MAP_READY_RATE=${aggregate.map_ready_rate}`);
  lines.push(`POPUP_SUCCESS_RATE=${aggregate.popup_success_rate}`);
  lines.push(`SEO_SUCCESS_RATE=${aggregate.seo_success_rate}`);
  lines.push(`SCREENSHOT_ANALYSIS_RATE=${aggregate.screenshot_analysis_rate}`);
  lines.push(`MAP_STABILITY_RATE=${aggregate.map_stability_rate}`);
  lines.push(`GEOLOCATION_RATE=${aggregate.geolocation_rate}`);
  lines.push(`REPEATABLE_PROD_BEHAVIOR=${aggregate.REPEATABLE_PROD_BEHAVIOR}`);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const previousCampaign = await readJson(campaignPath);
  const previousRuns = Array.isArray(previousCampaign?.runs) ? previousCampaign.runs : [];
  const previousPerformance = await readJson(performancePath);
  const previousPerformanceByRun = new Map(
    (Array.isArray(previousPerformance?.runs) ? previousPerformance.runs : [])
      .map((run) => [String(run.RUN_ID || ""), run])
      .filter(([runId]) => runId)
  );
  const entries = await fs.readdir(prodAuditDir, { withFileTypes: true }).catch(() => []);
  const campaignEntries = entries
    .filter((entry) => entry.isDirectory() && /^campaign-\d{8}T\d{6}Z$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rawCampaignNames = new Set(campaignEntries.map((entry) => entry.name));
  const previousByRun = new Map(
    previousRuns
      .map((run) => [String(run.RUN_ID || ""), run])
      .filter(([runId]) => runId)
  );
  const runIds = Array.from(new Set([
    ...previousByRun.keys(),
    ...rawCampaignNames
  ])).sort();
  const runs = [];
  for (const [index, runId] of runIds.entries()) {
    const fromRaw = rawCampaignNames.has(runId)
      ? await collectRun({ name: runId }, index)
      : null;
    const row = fromRaw || previousByRun.get(runId);
    if (isRealProdAttemptRow(row)) runs.push(row);
  }
  const aggregate = {
    generated_at: new Date().toISOString(),
    total_runs: runs.length,
    seed_challenge_rate: rate(runs, (run) => run.SEED_CHALLENGE),
    subresource_challenge_rate: rate(runs, (run) => run.SUBRESOURCE_CHALLENGE_COUNT > 0),
    app_code_success_rate: rate(runs, (run) => run.APP_CODE_REACHED === "YES"),
    map_ready_rate: rate(runs, (run) => run.MAP_READY === "YES"),
    popup_success_rate: rate(runs, (run) => run.POPUP_FLOW_COMPLETED === "YES"),
    seo_success_rate: rate(runs, (run) => run.SEO_FLOW_COMPLETED === "YES"),
    screenshot_analysis_rate: rate(runs, (run) => run.SCREENSHOT_ANALYSIS === "PASS"),
    map_stability_rate: rate(runs, (run) => run.MAP_STABILITY === "PASS"),
    geolocation_rate: rate(runs, (run) => run.GEOLOCATION === "PASS"),
    REPEATABLE_PROD_BEHAVIOR: runs.length >= 10 &&
      rate(runs, (run) => run.APP_CODE_REACHED === "YES") >= 0.7 &&
      rate(runs, (run) => run.MAP_READY === "YES") >= 0.7 &&
      rate(runs, (run) => run.POPUP_FLOW_COMPLETED === "YES") >= 0.5 &&
      rate(runs, (run) => run.SEO_FLOW_COMPLETED === "YES") >= 0.5
        ? "YES"
        : "NO"
  };
  await writeJson(campaignPath, {
    ...aggregate,
    runs
  });
  await fs.writeFile(repeatabilityPath, renderRepeatability(runs, aggregate), "utf8");
  const performanceRuns = [];
  for (const run of runs) {
    const summary = await readJson(path.join(repoRoot, run.REPORT_DIR, "summary.json"));
    if (!summary && previousPerformanceByRun.has(run.RUN_ID)) {
      performanceRuns.push(previousPerformanceByRun.get(run.RUN_ID));
      continue;
    }
    performanceRuns.push({
      RUN_ID: run.RUN_ID,
      TIMESTAMP: run.TIMESTAMP,
      ...timing(summary),
      RESULT: run.RESULT,
      STOP_REASON: run.STOP_REASON
    });
  }
  await writeJson(performancePath, {
    generated_at: aggregate.generated_at,
    runs: performanceRuns
  });
  console.log(`PROD_NIGHTLY_CAMPAIGN_RUNS=${runs.length}`);
  console.log(`REPEATABLE_PROD_BEHAVIOR=${aggregate.REPEATABLE_PROD_BEHAVIOR}`);
  console.log(`CAMPAIGN_REPORT=${rel(campaignPath)}`);
  console.log(`REPEATABILITY_REPORT=${rel(repeatabilityPath)}`);
  console.log(`PERFORMANCE_REPORT=${rel(performancePath)}`);
}

await main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
