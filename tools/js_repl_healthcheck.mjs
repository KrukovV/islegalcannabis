#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportRoot = path.join(repoRoot, "Reports", "js-repl");
const featuresPath = path.join(reportRoot, "features.txt");
const reportPath = path.join(reportRoot, "healthcheck.json");
const browserStackPath = path.join(reportRoot, "browser-stack-audit.md");
const issuePath = path.join(reportRoot, "skill-depends-on-removed-feature.md");
const skillPath = path.join(os.homedir(), ".codex", "skills", "playwright-interactive", "SKILL.md");
const fallbackSkillPath = path.join(os.homedir(), ".codex", "skills", ".system", "playwright-interactive", "SKILL.md");

function runCodex(args) {
  try {
    return {
      ok: true,
      stdout: execFileSync("codex", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      stderr: "",
      code: 0
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
      code: Number.isFinite(error.status) ? error.status : 1
    };
  }
}

function lines(input) {
  return String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function findFeatureLine(output, featureName) {
  return lines(output).find((line) => line.startsWith(featureName)) || "";
}

function summarizeFeatureState(featureLine) {
  if (!featureLine) return { present: "NO", state: "ABSENT", line: "" };
  if (/\sremoved\s+false\b/i.test(featureLine)) return { present: "NO", state: "REMOVED_UPSTREAM", line: featureLine };
  if (/\bstable\s+true\b/i.test(featureLine) || /\bexperimental\s+true\b/i.test(featureLine)) {
    return { present: "YES", state: "ENABLED", line: featureLine };
  }
  if (/\btrue\b/i.test(featureLine)) return { present: "YES", state: "ENABLED", line: featureLine };
  return { present: "NO", state: "DISABLED_OR_UNKNOWN", line: featureLine };
}

function parseDoctor(output) {
  const doctorLines = lines(output);
  const appServerLine = doctorLines.find((line) => line.includes("app-server")) || "";
  const statusLine = doctorLines.find((line) => line.includes("status                   ")) || "";
  const modeLine = doctorLines.find((line) => line.includes("mode                     ")) || "";
  const controlSocketLine = doctorLines.find((line) => line.includes("control socket")) || "";
  const settingsLine = doctorLines.find((line) => line.includes("settings                 ")) || "";
  const pidLine = doctorLines.find((line) => line.includes("pid file")) || "";
  const versionLine = doctorLines.find((line) => line.includes("app-server version")) || "";
  return {
    app_server_line: appServerLine,
    status_line: statusLine,
    mode_line: modeLine,
    control_socket_line: controlSocketLine,
    settings_line: settingsLine,
    pid_line: pidLine,
    version_line: versionLine
  };
}

function inferAppServerStatus(doctor) {
  const modeLine = doctor.mode_line || "";
  const statusLine = doctor.status_line || "";
  if (/persistent/i.test(modeLine) && /running/i.test(statusLine)) return "RUNNING_PERSISTENT";
  if (/ephemeral/i.test(modeLine) && /not running/i.test(statusLine)) return "NOT_RUNNING_EPHEMERAL";
  if (/running/i.test(statusLine)) return "RUNNING_UNCONFIRMED_MODE";
  return "UNCONFIRMED";
}

function parseJsonResult(result) {
  if (!result.ok) return null;
  try {
    return JSON.parse(String(result.stdout || "").trim());
  } catch {
    return null;
  }
}

function renderAuditTable(rows) {
  return [
    "| FEATURE | STATUS |",
    "| --- | --- |",
    ...rows.map(([feature, status]) => `| ${feature} | ${status} |`)
  ].join("\n");
}

async function resolveSkillPath() {
  return await fs.stat(skillPath).then(() => skillPath).catch(async () => {
    return await fs.stat(fallbackSkillPath).then(() => fallbackSkillPath).catch(() => "");
  });
}

async function main() {
  await fs.mkdir(reportRoot, { recursive: true });

  const versionResult = runCodex(["--version"]);
  const featuresResult = runCodex(["features", "list"]);
  const doctorResult = runCodex(["doctor"]);
  const appServerVersionResult = runCodex(["app-server", "daemon", "version"]);
  const skill = await resolveSkillPath();
  const skillText = skill ? await fs.readFile(skill, "utf8") : "";

  const jsReplState = summarizeFeatureState(findFeatureLine(featuresResult.stdout, "js_repl"));
  const browserUseState = summarizeFeatureState(findFeatureLine(featuresResult.stdout, "browser_use"));
  const inAppBrowserState = summarizeFeatureState(findFeatureLine(featuresResult.stdout, "in_app_browser"));
  const doctor = parseDoctor(doctorResult.stdout);
  const appServerVersion = parseJsonResult(appServerVersionResult);
  const appServerStatus = inferAppServerStatus(doctor);
  const skillDependsOnRemovedFeature =
    /js_repl must be enabled/i.test(skillText) ||
    /enable it in ~\/\.codex\/config\.toml/i.test(skillText) ||
    /--enable js_repl/i.test(skillText);

  const health = {
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    cli_version: String(versionResult.stdout || "").trim(),
    skill_path: skill,
    skill_present: Boolean(skill),
    feature_summary: {
      js_repl: jsReplState,
      browser_use: browserUseState,
      in_app_browser: inAppBrowserState
    },
    browser_stack: {
      JS_REPL_STATUS: "REMOVED_UPSTREAM",
      APP_SERVER_STATUS: appServerStatus,
      APP_SERVER_MODE: /persistent/i.test(doctor.mode_line) ? "PERSISTENT" : /ephemeral/i.test(doctor.mode_line) ? "EPHEMERAL" : "UNCONFIRMED",
      APP_SERVER_DAEMON_VERSION: appServerVersion?.appServerVersion || "",
      PERSISTENT_BROWSER_STATUS: "AVAILABLE_IN_PROJECT_SCRIPTS",
      BROWSER_USE_STATUS: browserUseState.present === "YES" ? "AVAILABLE_RUNTIME_FEATURE" : "UNAVAILABLE",
      IN_APP_BROWSER_STATUS: inAppBrowserState.present === "YES" ? "AVAILABLE_RUNTIME_FEATURE" : "UNAVAILABLE",
      PLAYWRIGHT_INTERACTIVE_STATUS: skillDependsOnRemovedFeature
        ? "BLOCKED_SKILL_DEPENDS_ON_REMOVED_FEATURE"
        : "UNCONFIRMED",
      POPUP_INSPECTION_STATUS: "AVAILABLE_VIA_tools/prod_popup_matrix_audit.mjs"
    },
    issue: {
      key: skillDependsOnRemovedFeature ? "SKILL_DEPENDS_ON_REMOVED_FEATURE" : "",
      present: skillDependsOnRemovedFeature
    },
    evidence: {
      doctor,
      app_server_version: appServerVersion,
      skill_requires_js_repl: skillDependsOnRemovedFeature,
      available_tools: [
        `js_repl:${jsReplState.state}`,
        `browser_use:${browserUseState.state}`,
        `in_app_browser:${inAppBrowserState.state}`
      ].join(", ")
    }
  };

  const browserAuditRows = [
    ["Persistent Browser", health.browser_stack.PERSISTENT_BROWSER_STATUS],
    ["In-App Browser", health.browser_stack.IN_APP_BROWSER_STATUS],
    ["Browser Use", health.browser_stack.BROWSER_USE_STATUS],
    ["Playwright Interactive", health.browser_stack.PLAYWRIGHT_INTERACTIVE_STATUS],
    ["Popup Inspection", health.browser_stack.POPUP_INSPECTION_STATUS],
    ["App Server", `${health.browser_stack.APP_SERVER_STATUS} (${health.browser_stack.APP_SERVER_MODE})`],
    ["JS_REPL", health.browser_stack.JS_REPL_STATUS]
  ];

  const featuresTxt = [
    "# Browser Stack Healthcheck",
    `GENERATED_AT=${health.generated_at}`,
    `CODEX_CLI_VERSION=${health.cli_version}`,
    `JS_REPL_STATUS=${health.browser_stack.JS_REPL_STATUS}`,
    `APP_SERVER_STATUS=${health.browser_stack.APP_SERVER_STATUS}`,
    `APP_SERVER_MODE=${health.browser_stack.APP_SERVER_MODE}`,
    `APP_SERVER_DAEMON_VERSION=${health.browser_stack.APP_SERVER_DAEMON_VERSION || "UNCONFIRMED"}`,
    `PLAYWRIGHT_INTERACTIVE_PRESENT=${health.skill_present ? "YES" : "NO"}`,
    `PLAYWRIGHT_INTERACTIVE_STATUS=${health.browser_stack.PLAYWRIGHT_INTERACTIVE_STATUS}`,
    `PLAYWRIGHT_INTERACTIVE_ISSUE=${health.issue.key || "NONE"}`,
    `BROWSER_USE_STATUS=${health.browser_stack.BROWSER_USE_STATUS}`,
    `IN_APP_BROWSER_STATUS=${health.browser_stack.IN_APP_BROWSER_STATUS}`,
    `PERSISTENT_BROWSER_STATUS=${health.browser_stack.PERSISTENT_BROWSER_STATUS}`,
    `POPUP_INSPECTION_STATUS=${health.browser_stack.POPUP_INSPECTION_STATUS}`,
    `AVAILABLE_TOOLS=${health.evidence.available_tools}`,
    "",
    "## FEATURES LIST",
    featuresResult.stdout.trim() || "[empty]",
    "",
    "## DOCTOR APP SERVER",
    doctorResult.stdout.trim() || "[empty]",
    "",
    "## APP SERVER VERSION",
    appServerVersionResult.stdout.trim() || appServerVersionResult.stderr.trim() || "[empty]",
    "",
    "## PLAYWRIGHT INTERACTIVE SKILL",
    skillText.trim() || "[missing]"
  ].join("\n");

  const browserStackMd = [
    "# Browser Stack Audit",
    "",
    `Generated: ${health.generated_at}`,
    `JS_REPL_STATUS=${health.browser_stack.JS_REPL_STATUS}`,
    `PLAYWRIGHT_INTERACTIVE_ISSUE=${health.issue.key || "NONE"}`,
    "",
    "## Feature Status",
    "",
    renderAuditTable(browserAuditRows),
    "",
    "## Evidence",
    "",
    `- app-server: ${health.browser_stack.APP_SERVER_STATUS}`,
    `- app-server version: ${health.browser_stack.APP_SERVER_DAEMON_VERSION || "UNCONFIRMED"}`,
    `- available browser features: ${health.evidence.available_tools}`,
    `- skill path: ${health.skill_path || "missing"}`,
    ""
  ].join("\n");

  const skillIssueMd = [
    "# SKILL_DEPENDS_ON_REMOVED_FEATURE",
    "",
    "## Fact",
    "",
    "- `JS_REPL_STATUS=REMOVED_UPSTREAM`.",
    "- Local `playwright-interactive` skill still declares `js_repl` as a hard precondition.",
    "- Current supported browser surface is `app-server` plus Codex browser features such as `browser_use` and `in_app_browser`, not `js_repl`.",
    "",
    "## Evidence",
    "",
    `- skill path: ${health.skill_path || "missing"}`,
    `- js_repl feature line: ${jsReplState.line || "missing"}`,
    `- app-server status: ${health.browser_stack.APP_SERVER_STATUS}`,
    `- app-server version: ${health.browser_stack.APP_SERVER_DAEMON_VERSION || "UNCONFIRMED"}`,
    "",
    "## Required Change",
    "",
    "- Replace `js_repl` preconditions in the skill with a supported `app-server` or Codex browser path.",
    "- Keep isLegal production audit ownership in repo scripts, with persistent browser context as the secondary interactive workflow.",
    ""
  ].join("\n");

  await fs.writeFile(featuresPath, `${featuresTxt}\n`, "utf8");
  await fs.writeFile(reportPath, `${JSON.stringify(health, null, 2)}\n`, "utf8");
  await fs.writeFile(browserStackPath, `${browserStackMd}\n`, "utf8");
  await fs.writeFile(issuePath, `${skillIssueMd}\n`, "utf8");

  console.log(`JS_REPL_STATUS=${health.browser_stack.JS_REPL_STATUS}`);
  console.log(`APP_SERVER_STATUS=${health.browser_stack.APP_SERVER_STATUS}`);
  console.log(`PLAYWRIGHT_INTERACTIVE_STATUS=${health.browser_stack.PLAYWRIGHT_INTERACTIVE_STATUS}`);
  console.log(`PLAYWRIGHT_INTERACTIVE_ISSUE=${health.issue.key || "NONE"}`);
  console.log(`BROWSER_USE_STATUS=${health.browser_stack.BROWSER_USE_STATUS}`);
  console.log(`IN_APP_BROWSER_STATUS=${health.browser_stack.IN_APP_BROWSER_STATUS}`);
  console.log(`REPORT=${path.relative(repoRoot, featuresPath)}`);
  console.log(`JSON=${path.relative(repoRoot, reportPath)}`);
  console.log(`AUDIT=${path.relative(repoRoot, browserStackPath)}`);
  console.log(`ISSUE=${path.relative(repoRoot, issuePath)}`);
}

await main().catch(async (error) => {
  await fs.mkdir(reportRoot, { recursive: true });
  await fs.writeFile(path.join(reportRoot, "error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  console.error(error.message || error);
  process.exit(1);
});
