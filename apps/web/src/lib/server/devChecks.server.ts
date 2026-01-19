import "server-only";

import fs from "node:fs";
import path from "node:path";

export function readSmokeStatus(): string {
  try {
    const filePath = path.join(process.cwd(), ".checkpoints", "ci-result.txt");
    if (!fs.existsSync(filePath)) return "UNCONFIRMED";
    const text = fs.readFileSync(filePath, "utf8");
    const match = text.match(/SMOKE=([^\s]+)/);
    return match ? match[1] : "UNCONFIRMED";
  } catch {
    return "UNCONFIRMED";
  }
}

export function readSmokeTracePreview(limit = 10): {
  ids: string[];
  available: boolean;
  pagesOk?: number | null;
  pagesTotal?: number | null;
} {
  try {
    const filePath = path.join(process.cwd(), "Reports", "smoke-trace.json");
    if (!fs.existsSync(filePath)) {
      return { ids: [], available: false, pagesOk: null, pagesTotal: null };
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const checks = Array.isArray(data.checks) ? data.checks : [];
    const passed = Number(data.passed ?? NaN);
    const failed = Number(data.failed ?? NaN);
    const total = Number(data.total ?? NaN);
    const pagesOk = Number.isFinite(passed) ? passed : null;
    let pagesTotal = Number.isFinite(total) ? total : null;
    if (pagesTotal === null && Number.isFinite(passed) && Number.isFinite(failed)) {
      pagesTotal = passed + failed;
    }
    const ids: string[] = [];
    for (const item of checks) {
      const id = typeof item?.id === "string" ? item.id : null;
      if (id && !ids.includes(id)) ids.push(id);
      if (ids.length >= limit) break;
    }
    return { ids, available: true, pagesOk, pagesTotal };
  } catch {
    return { ids: [], available: false, pagesOk: null, pagesTotal: null };
  }
}
