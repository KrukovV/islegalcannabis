import fs from "node:fs";
import path from "node:path";

type IsoEntry = {
  alpha2: string;
  name: string;
};

type RawIsoEntry = {
  alpha2?: string;
  id?: string;
  name?: string;
};

export type IsoMeta = {
  alpha2: string;
  name: string;
  flag: string;
  verify: {
    isoObp: string;
    wiki: string;
  };
};

const ISO_WIKI = "https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2";
const cache: { map: Map<string, IsoEntry> | null; list: IsoMeta[] | null } = {
  map: null,
  list: null
};

function findRepoRoot(startDir: string) {
  let current = startDir;
  for (let i = 0; i < 10; i += 1) {
    const candidate = path.join(current, "data", "iso3166", "iso3166-1.json");
    if (fs.existsSync(candidate)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}

function loadIsoMap(): Map<string, IsoEntry> {
  if (cache.map) return cache.map;
  const root = findRepoRoot(process.cwd());
  const file = path.join(root, "data", "iso3166", "iso3166-1.json");
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const entries: RawIsoEntry[] = Array.isArray(payload?.entries)
    ? payload.entries
    : [];
  const map = new Map<string, IsoEntry>();
  entries.forEach((entry) => {
    const alpha2 = String(entry?.alpha2 ?? entry?.id ?? "").toUpperCase();
    const name = entry?.name;
    if (alpha2 && name) {
      map.set(alpha2, { alpha2, name: String(name) });
    }
  });
  cache.map = map;
  return map;
}

function flagForAlpha2(alpha2: string): string {
  if (alpha2.length !== 2) return "🏳️";
  return String.fromCodePoint(
    ...alpha2.split("").map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)
  );
}

export function getIsoMeta(alpha2: string | null | undefined): IsoMeta | null {
  const code = String(alpha2 ?? "").trim().toUpperCase();
  if (!code) return null;
  const entry = loadIsoMap().get(code);
  if (!entry) return null;
  return {
    alpha2: entry.alpha2,
    name: entry.name,
    flag: flagForAlpha2(entry.alpha2),
    verify: {
      isoObp: `https://www.iso.org/obp/ui/#iso:code:3166:${entry.alpha2}`,
      wiki: ISO_WIKI
    }
  };
}

export function listIsoMeta(): IsoMeta[] {
  if (cache.list) return cache.list;
  const map = loadIsoMap();
  const list = Array.from(map.values()).map((entry) => ({
    alpha2: entry.alpha2,
    name: entry.name,
    flag: flagForAlpha2(entry.alpha2),
    verify: {
      isoObp: `https://www.iso.org/obp/ui/#iso:code:3166:${entry.alpha2}`,
      wiki: ISO_WIKI
    }
  }));
  cache.list = list;
  return list;
}
