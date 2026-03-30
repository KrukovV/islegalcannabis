#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const codexHome = path.join(os.homedir(), ".codex");
const skillPath = path.join(codexHome, "skills", "playwright-interactive", "SKILL.md");
const configPath = path.join(codexHome, "config.toml");
const defaultSnapshotPath = path.join(root, "Artifacts", "playwright-interactive", "session-runtime.json");
const snapshotPath = process.env.PLAYWRIGHT_INTERACTIVE_RUNTIME_PATH || defaultSnapshotPath;
const fallbackScriptPath = path.join(root, "tools", "playwright-smoke", "wiki_truth_live_probe.mjs");

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function parseTriState(value) {
  if (value === "1" || value === 1 || value === true) return 1;
  if (value === "0" || value === 0 || value === false) return 0;
  return null;
}

function readObservedState(envKey, snapshotKey, snapshot) {
  const envValue = parseTriState(process.env[envKey]);
  if (envValue !== null) {
    return { value: envValue, source: "env", observed: 1 };
  }
  const snapshotValue = parseTriState(snapshot?.[snapshotKey]);
  if (snapshotValue !== null) {
    return { value: snapshotValue, source: "snapshot", observed: 1 };
  }
  return { value: 0, source: "unobserved", observed: 0 };
}

const config = readText(configPath);
const snapshot = readJson(snapshotPath);
const skillInstalled = fs.existsSync(skillPath);
const workflowRequested = process.env.PLAYWRIGHT_INTERACTIVE_REQUESTED === "0" ? 0 : 1;
const featureEnabled = /\[features\][\s\S]*?js_repl\s*=\s*true/.test(config) ? 1 : 0;
const resumedSession = parseTriState(process.env.SESSION_RESUMED) ?? parseTriState(snapshot?.session_resumed) ?? 0;
const fallbackAvailable = fs.existsSync(fallbackScriptPath) ? 1 : 0;

const sessionToolState = readObservedState("SESSION_JS_REPL_AVAILABLE", "session_tool_js_repl", snapshot);
const browserAttachedState = readObservedState("SESSION_BROWSER_RUNTIME_ATTACHED", "browser_runtime_attached", snapshot);
const browserLaunchState = readObservedState("SESSION_JS_REPL_BROWSER_LAUNCH_OK", "playwright_browser_launch_ok", snapshot);
const evidenceComplete =
  sessionToolState.observed === 1 && browserAttachedState.observed === 1 && browserLaunchState.observed === 1;

let readyState = "UNCONFIRMED";
if (
  featureEnabled === 1 &&
  workflowRequested === 1 &&
  evidenceComplete
) {
  readyState =
    sessionToolState.value === 1 && browserAttachedState.value === 1 && browserLaunchState.value === 1
      ? "READY"
      : "DEGRADED";
}
const ready = readyState === "READY" ? 1 : 0;

let rootCause = "OK";
if (!skillInstalled) {
  rootCause = "WORKFLOW_NOT_INSTALLED";
} else if (!workflowRequested) {
  rootCause = "WORKFLOW_NOT_REQUESTED";
} else if (!featureEnabled) {
  rootCause = "FEATURE_JS_REPL_DISABLED";
} else if (!sessionToolState.observed) {
  rootCause = resumedSession ? "SESSION_TOOL_JS_REPL_UNOBSERVED_RESUMED" : "SESSION_TOOL_JS_REPL_UNOBSERVED";
} else if (sessionToolState.value !== 1) {
  rootCause = resumedSession ? "SESSION_TOOL_JS_REPL_UNAVAILABLE_RESUMED" : "SESSION_TOOL_JS_REPL_UNAVAILABLE";
} else if (!browserAttachedState.observed) {
  rootCause = "BROWSER_RUNTIME_ATTACHMENT_UNOBSERVED";
} else if (browserAttachedState.value !== 1) {
  rootCause = "BROWSER_RUNTIME_NOT_ATTACHED";
} else if (!browserLaunchState.observed) {
  rootCause = "PLAYWRIGHT_BROWSER_LAUNCH_UNOBSERVED";
} else if (browserLaunchState.value !== 1) {
  rootCause = "PLAYWRIGHT_BROWSER_LAUNCH_FAILED";
}

const degraded = workflowRequested === 1 && evidenceComplete && ready !== 1 ? 1 : 0;
const verificationMode = ready === 1 ? "interactive_js_repl" : degraded ? (fallbackAvailable ? "headed_fallback" : "none") : "evidence_incomplete";
const reasonTree = [
  `feature=${featureEnabled}`,
  `session_tool=${sessionToolState.value}:${sessionToolState.source}`,
  `browser_attached=${browserAttachedState.value}:${browserAttachedState.source}`,
  `browser_launch=${browserLaunchState.value}:${browserLaunchState.source}`,
  `ready=${readyState}`
].join(";");

console.log(`PLAYWRIGHT_INTERACTIVE_WORKFLOW=${skillInstalled ? 1 : 0}`);
console.log(`PLAYWRIGHT_INTERACTIVE_REQUESTED=${workflowRequested}`);
console.log(`PLAYWRIGHT_INTERACTIVE_SKILL_PATH=${skillInstalled ? skillPath : "-"}`);
console.log(`PLAYWRIGHT_INTERACTIVE_CONFIG_PATH=${fs.existsSync(configPath) ? configPath : "-"}`);
console.log(`PLAYWRIGHT_INTERACTIVE_RUNTIME_PATH=${fs.existsSync(snapshotPath) ? snapshotPath : "-"}`);
console.log(`CODEX_FEATURE_JS_REPL=${featureEnabled}`);
console.log(`PLAYWRIGHT_INTERACTIVE_FEATURE_ENABLED=${featureEnabled}`);
console.log(`PLAYWRIGHT_INTERACTIVE_SESSION_TOOL_AVAILABLE=${sessionToolState.value}`);
console.log(`PLAYWRIGHT_INTERACTIVE_BROWSER_RUNTIME_ATTACHED=${browserAttachedState.value}`);
console.log(`PLAYWRIGHT_INTERACTIVE_READY_STATE=${readyState}`);
console.log(`SESSION_TOOL_JS_REPL=${sessionToolState.value}`);
console.log(`SESSION_TOOL_JS_REPL_OBSERVED=${sessionToolState.observed}`);
console.log(`SESSION_TOOL_JS_REPL_SOURCE=${sessionToolState.source}`);
console.log(`BROWSER_RUNTIME_ATTACHED=${browserAttachedState.value}`);
console.log(`BROWSER_RUNTIME_ATTACHED_OBSERVED=${browserAttachedState.observed}`);
console.log(`BROWSER_RUNTIME_ATTACHED_SOURCE=${browserAttachedState.source}`);
console.log(`PLAYWRIGHT_BROWSER_LAUNCH_OK=${browserLaunchState.value}`);
console.log(`PLAYWRIGHT_BROWSER_LAUNCH_OBSERVED=${browserLaunchState.observed}`);
console.log(`PLAYWRIGHT_BROWSER_LAUNCH_SOURCE=${browserLaunchState.source}`);
console.log(`PLAYWRIGHT_INTERACTIVE_EVIDENCE_COMPLETE=${evidenceComplete ? 1 : 0}`);
console.log(`PLAYWRIGHT_INTERACTIVE_READY=${ready}`);
console.log(`PLAYWRIGHT_INTERACTIVE_READY_REASON_TREE=${reasonTree}`);
console.log(`PLAYWRIGHT_INTERACTIVE_ROOT_CAUSE=${rootCause}`);
console.log(`PLAYWRIGHT_INTERACTIVE_DEGRADED=${degraded}`);
console.log(`PLAYWRIGHT_INTERACTIVE_FRESH_SESSION_REQUIRED=${degraded && resumedSession ? 1 : 0}`);
console.log(`PLAYWRIGHT_FALLBACK_AVAILABLE=${fallbackAvailable}`);
console.log(`PLAYWRIGHT_VERIFICATION_MODE=${verificationMode}`);
console.log(`SESSION_RESUMED=${resumedSession}`);
console.log(`JS_REPL_CONFIG_ENABLED=${featureEnabled}`);
console.log(`JS_REPL_AVAILABLE=${sessionToolState.value}`);
console.log(`JS_REPL_AVAILABLE_OBSERVED=${sessionToolState.observed}`);
console.log(`JS_REPL_BROWSER_LAUNCH_OK=${browserLaunchState.observed ? browserLaunchState.value : "-"}`);
console.log(`PLAYWRIGHT_INTERACTIVE_RUNTIME_OK=${ready}`);
if (degraded) {
  console.log("PLAYWRIGHT_INTERACTIVE_DEGRADED_MESSAGE=interactive_runtime_not_ready_use_bootstrap_or_explicit_fallback");
}
