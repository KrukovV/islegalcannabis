#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "Reports", "ui_smoke.txt");
const requireWebkit = String(process.env.UI_SMOKE_WEBKIT_REQUIRED || "1") !== "0";

if (!fs.existsSync(reportPath)) {
  console.log("HOME_FULLSCREEN_CONTRACT_GUARD=FAIL");
  console.log("HOME_FULLSCREEN_CONTRACT_REASON=MISSING_REPORT");
  process.exit(1);
}

const report = fs.readFileSync(reportPath, "utf8");
const requiredLines = [
  "UI_SMOKE_OK=1",
  "FULL_SCREEN_HOME_OK=1",
  "FULL_SCREEN_HOME_MOBILE_OK=1",
  "HOME_SINGLE_SCREEN_OK=1",
  "HOME_DOCUMENT_SCROLL_OK=1",
  "FULL_SCREEN_HOME_CHROMIUM_DESKTOP_OK=1",
  "FULL_SCREEN_HOME_CHROMIUM_MOBILE_OK=1",
  "HOME_DOCUMENT_SCROLL_CHROMIUM_DESKTOP_OK=1",
  "HOME_DOCUMENT_SCROLL_CHROMIUM_MOBILE_OK=1"
];

if (requireWebkit) {
  requiredLines.push(
    "UI_SMOKE_WEBKIT_OK=1",
    "FULL_SCREEN_HOME_WEBKIT_DESKTOP_OK=1",
    "FULL_SCREEN_HOME_WEBKIT_MOBILE_OK=1",
    "HOME_DOCUMENT_SCROLL_WEBKIT_DESKTOP_OK=1",
    "HOME_DOCUMENT_SCROLL_WEBKIT_MOBILE_OK=1"
  );
}

const missing = requiredLines.filter((line) => !report.includes(line));
console.log(`HOME_FULLSCREEN_CONTRACT_REQUIRED=${requiredLines.length}`);
console.log(`HOME_FULLSCREEN_CONTRACT_PRESENT=${requiredLines.length - missing.length}`);
if (missing.length > 0) {
  console.log(`HOME_FULLSCREEN_CONTRACT_MISSING=${missing.join(",")}`);
  console.log("HOME_FULLSCREEN_CONTRACT_GUARD=FAIL");
  process.exit(1);
}

console.log("HOME_FULLSCREEN_CONTRACT_GUARD=PASS");
