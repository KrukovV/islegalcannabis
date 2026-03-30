import { promises as fs } from "fs";
import path from "path";

function parseKvText(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const root = process.cwd();
  const coveragePath = path.join(root, "Reports", "coverage.txt");
  const wikiPagesPath = path.join(root, "data", "ssot", "wiki_pages_universe.json");
  const usStatesWikiPath = path.join(root, "data", "ssot", "us_states_wiki.json");
  const usStatesFallbackPath = path.join(root, "data", "ssot", "us_states.json");

  const [coverageRaw, wikiPages, usStatesWiki, usStatesFallback] = await Promise.all([
    fs.readFile(coveragePath, "utf8").catch(() => ""),
    readJson<{ entries?: unknown[]; items?: unknown[] }>(wikiPagesPath, {}),
    readJson<{ items?: unknown[]; fetched_ts?: string }>(usStatesWikiPath, {}),
    readJson<{ items?: unknown[] }>(usStatesFallbackPath, {})
  ]);

  const coverage = parseKvText(coverageRaw);
  const wikiPagesCount = Array.isArray(wikiPages.entries)
    ? wikiPages.entries.length
    : Array.isArray(wikiPages.items)
      ? wikiPages.items.length
      : 0;
  const usStatesCount = Array.isArray(usStatesWiki.items)
    ? usStatesWiki.items.length
    : Array.isArray(usStatesFallback.items)
      ? usStatesFallback.items.length
      : 0;

  return Response.json(
    {
      fetchedAt: new Date().toISOString(),
      fromApiAt: String(usStatesWiki.fetched_ts || "-"),
      coverage,
      wikiPagesCount,
      usStatesCount
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

