export async function readSmokeStatus(): Promise<string> {
  if (typeof window !== "undefined") return "UNCONFIRMED";
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const filePath = path.join(process.cwd(), ".checkpoints", "ci-result.txt");
    if (!fs.existsSync(filePath)) return "UNCONFIRMED";
    const text = fs.readFileSync(filePath, "utf8");
    const match = text.match(/SMOKE=([^\s]+)/);
    return match ? match[1] : "UNCONFIRMED";
  } catch {
    return "UNCONFIRMED";
  }
}

export async function readSmokeTracePreview(limit = 10): Promise<{
  entries: string[];
  available: boolean;
  pagesOk?: number | null;
  pagesTotal?: number | null;
}> {
  if (typeof window !== "undefined") {
    return { entries: [], available: false, pagesOk: null, pagesTotal: null };
  }
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const filePath = path.join(process.cwd(), "Reports", "smoke-trace.json");
    if (!fs.existsSync(filePath)) {
      return { entries: [], available: false, pagesOk: null, pagesTotal: null };
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
    const entries: string[] = [];
    for (const item of checks) {
      const id = typeof item?.id === "string" ? item.id : null;
      if (!id || entries.some((entry) => entry.endsWith(` ${id}`) || entry === id)) continue;
      const flag = typeof item?.flag === "string" ? item.flag : "";
      const label = flag ? `${flag} ${id}` : id;
      entries.push(label);
      if (entries.length >= limit) break;
    }
    return { entries, available: true, pagesOk, pagesTotal };
  } catch {
    return { entries: [], available: false, pagesOk: null, pagesTotal: null };
  }
}
