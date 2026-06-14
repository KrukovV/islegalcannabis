#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(repoRoot, "Reports", "ProdAudit");
const headerSummaryPath = process.env.PROD_HEADER_ONLY_SUMMARY ||
  path.join(reportDir, "repeatability", "20260611T150601", "summary.json");
const cookieSummaryPath = process.env.PROD_COOKIE_FLOW_SUMMARY ||
  path.join(reportDir, "20260611150629", "summary.json");
const headerLiveCheckPath = process.env.PROD_HEADER_ONLY_LIVE_CHECK ||
  path.join(reportDir, "20260611151745", "summary.json");
const popupAttemptPath = process.env.PROD_POPUP_ATTEMPT_SUMMARY ||
  path.join(reportDir, "popup-matrix", "20260611T151852", "summary.json");
const restoredAccessPath = process.env.PROD_RESTORED_ACCESS_SUMMARY ||
  path.join(reportDir, "20260611144735", "summary.json");
const frenchGuianaPopupPath = process.env.PROD_GF_POPUP ||
  path.join(reportDir, "popup-matrix", "20260611T083603", "GF", "popup.png");
const kosovoPopupPath = process.env.PROD_XK_POPUP ||
  path.join(reportDir, "popup-matrix", "latest", "XK", "popup.png");
const reportBase = path.join(reportDir, "transport-access-matrix");

async function readJson(filePath) {
  return await fs.readFile(filePath, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => null);
}

async function fileExists(filePath) {
  return await fs.access(filePath).then(() => true).catch(() => false);
}

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function statRow(mode, summaryPath, summary) {
  if (!summary) {
    return {
      mode,
      runs: 0,
      success_count: 0,
      challenge_count: 0,
      challenge_rate: null,
      app_code_reached: "NO",
      source: rel(summaryPath),
      found: false
    };
  }
  const runs =
    numberOrNull(summary.run_count) ??
    numberOrNull(summary.full_bypass_session_run_count) ??
    numberOrNull(summary.OPERATION_COUNT) ??
    0;
  const successCount =
    numberOrNull(summary.SUCCESS_COUNT) ??
    numberOrNull(summary.success_count) ??
    numberOrNull(summary.successful_full_ui_runs) ??
    0;
  const challengeCount =
    numberOrNull(summary.CHALLENGE_COUNT) ??
    numberOrNull(summary.challenge_count) ??
    numberOrNull(summary.full_bypass_session_challenge_count) ??
    0;
  const challengeRate =
    numberOrNull(summary.CHALLENGE_RATE) ??
    numberOrNull(summary.full_bypass_session_challenge_rate) ??
    (runs > 0 ? Number((challengeCount / runs).toFixed(4)) : null);
  return {
    mode,
    runs,
    success_count: successCount,
    challenge_count: challengeCount,
    challenge_rate: challengeRate,
    app_code_reached:
      summary.APP_CODE_REACHED === "YES" || successCount > 0 ? "YES" : "NO",
    source: rel(summaryPath),
    found: true
  };
}

function chooseBestTransport(headerOnly, cookieFlow) {
  if (headerOnly.app_code_reached === "YES" && cookieFlow.app_code_reached !== "YES") {
    return "HEADER_ONLY";
  }
  if (headerOnly.app_code_reached !== "YES" && cookieFlow.app_code_reached === "YES") {
    return "COOKIE_FLOW";
  }
  if (headerOnly.challenge_rate !== null && cookieFlow.challenge_rate !== null) {
    if (headerOnly.challenge_rate < cookieFlow.challenge_rate) return "HEADER_ONLY";
    if (headerOnly.challenge_rate > cookieFlow.challenge_rate) return "COOKIE_FLOW";
  }
  if (headerOnly.success_count > cookieFlow.success_count) return "HEADER_ONLY";
  if (headerOnly.success_count < cookieFlow.success_count) return "COOKIE_FLOW";
  return "HEADER_ONLY";
}

async function main() {
  const [
    headerSummary,
    cookieSummary,
    headerLiveCheck,
    popupAttempt,
    restoredAccess,
    frenchGuianaPopupExists,
    kosovoPopupExists
  ] = await Promise.all([
    readJson(headerSummaryPath),
    readJson(cookieSummaryPath),
    readJson(headerLiveCheckPath),
    readJson(popupAttemptPath),
    readJson(restoredAccessPath),
    fileExists(frenchGuianaPopupPath),
    fileExists(kosovoPopupPath)
  ]);

  const headerOnly = statRow("HEADER_ONLY", headerSummaryPath, headerSummary);
  const cookieFlow = statRow("OFFICIAL_COOKIE_FLOW", cookieSummaryPath, cookieSummary);
  const currentBestTransport = chooseBestTransport(headerOnly, cookieFlow);

  const payload = {
    generated_at: new Date().toISOString(),
    CURRENT_BEST_TRANSPORT: currentBestTransport,
    modes: [headerOnly, cookieFlow],
    historical_restored_access: {
      source: rel(restoredAccessPath),
      app_code_reached: restoredAccess?.APP_CODE_REACHED || "NO",
      chosen_target: restoredAccess?.chosen_target || "",
      homepage: restoredAccess?.artifacts?.homepage || "",
      new_map: restoredAccess?.artifacts?.new_map || ""
    },
    latest_header_only_live_check: {
      source: rel(headerLiveCheckPath),
      app_code_reached: headerLiveCheck?.APP_CODE_REACHED || "NO",
      challenge_rate:
        numberOrNull(headerLiveCheck?.CHALLENGE_RATE) ??
        numberOrNull(headerLiveCheck?.full_bypass_session_challenge_rate),
      chosen_target: headerLiveCheck?.chosen_target || ""
    },
    latest_popup_attempt: {
      source: rel(popupAttemptPath),
      status: popupAttempt?.status || "UNCONFIRMED",
      challenge_rate: numberOrNull(popupAttempt?.CHALLENGE_RATE),
      pass: Boolean(popupAttempt?.PASS)
    },
    product_artifacts: {
      kosovo_popup_exists: kosovoPopupExists,
      kosovo_popup_path: kosovoPopupExists ? rel(kosovoPopupPath) : "",
      french_guiana_popup_exists: frenchGuianaPopupExists,
      french_guiana_popup_path: frenchGuianaPopupExists ? rel(frenchGuianaPopupPath) : ""
    },
    done_when: {
      kosovo_popup_screenshot: kosovoPopupExists,
      french_guiana_popup_screenshot: frenchGuianaPopupExists,
      territory_matrix_pass: false,
      three_successful_full_ui_runs: false
    }
  };

  const md = [
    "# Production Transport Access Matrix",
    "",
    `Generated: ${payload.generated_at}`,
    `CURRENT_BEST_TRANSPORT=${payload.CURRENT_BEST_TRANSPORT}`,
    "",
    "## Access Matrix",
    "",
    "| MODE | RUNS | SUCCESS_COUNT | CHALLENGE_COUNT | CHALLENGE_RATE | APP_CODE_REACHED | SOURCE |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...payload.modes.map((row) => `| ${row.mode} | ${row.runs} | ${row.success_count} | ${row.challenge_count} | ${row.challenge_rate ?? "UNCONFIRMED"} | ${row.app_code_reached} | ${row.source} |`),
    "",
    "## Historical Restored Access",
    "",
    `SOURCE=${payload.historical_restored_access.source}`,
    `APP_CODE_REACHED=${payload.historical_restored_access.app_code_reached}`,
    `HOMEPAGE=${payload.historical_restored_access.homepage || "NONE"}`,
    `NEW_MAP=${payload.historical_restored_access.new_map || "NONE"}`,
    "",
    "## Latest Live Checks",
    "",
    `HEADER_ONLY_LIVE_CHECK_SOURCE=${payload.latest_header_only_live_check.source}`,
    `HEADER_ONLY_LIVE_CHECK_APP_CODE_REACHED=${payload.latest_header_only_live_check.app_code_reached}`,
    `HEADER_ONLY_LIVE_CHECK_CHALLENGE_RATE=${payload.latest_header_only_live_check.challenge_rate ?? "UNCONFIRMED"}`,
    `POPUP_ATTEMPT_SOURCE=${payload.latest_popup_attempt.source}`,
    `POPUP_ATTEMPT_STATUS=${payload.latest_popup_attempt.status}`,
    `POPUP_ATTEMPT_CHALLENGE_RATE=${payload.latest_popup_attempt.challenge_rate ?? "UNCONFIRMED"}`,
    "",
    "## Product Artifact State",
    "",
    `KOSOVO_POPUP_EXISTS=${payload.product_artifacts.kosovo_popup_exists ? "YES" : "NO"}`,
    `KOSOVO_POPUP_PATH=${payload.product_artifacts.kosovo_popup_path || "NONE"}`,
    `FRENCH_GUIANA_POPUP_EXISTS=${payload.product_artifacts.french_guiana_popup_exists ? "YES" : "NO"}`,
    `FRENCH_GUIANA_POPUP_PATH=${payload.product_artifacts.french_guiana_popup_path || "NONE"}`,
    "",
    "## DONE WHEN Checklist",
    "",
    `- [${payload.done_when.kosovo_popup_screenshot ? "x" : " "}] Kosovo popup screenshot exists`,
    `- [${payload.done_when.french_guiana_popup_screenshot ? "x" : " "}] French Guiana popup screenshot exists`,
    `- [${payload.done_when.territory_matrix_pass ? "x" : " "}] territory matrix PASS`,
    `- [${payload.done_when.three_successful_full_ui_runs ? "x" : " "}] 3 successful production full UI runs`
  ].join("\n");

  await fs.writeFile(`${reportBase}.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(`${reportBase}.md`, `${md}\n`, "utf8");

  console.log(`CURRENT_BEST_TRANSPORT=${payload.CURRENT_BEST_TRANSPORT}`);
  console.log(`REPORT_MD=${rel(`${reportBase}.md`)}`);
  console.log(`REPORT_JSON=${rel(`${reportBase}.json`)}`);
}

await main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
