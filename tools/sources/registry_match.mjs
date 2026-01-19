import fs from "node:fs";
import path from "node:path";
import { normalizeSources } from "../../packages/shared/src/sources.js";
import { loadSourceRegistries } from "./load_registries.mjs";

const REGISTRY_PATH = path.join(
  process.cwd(),
  "data",
  "sources",
  "sources_registry.json"
);

let cachedRegistry = null;
const registries = loadSourceRegistries();

function loadRegistry() {
  if (cachedRegistry) return cachedRegistry;
  if (!fs.existsSync(REGISTRY_PATH)) {
    cachedRegistry = {};
    return cachedRegistry;
  }
  try {
    cachedRegistry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  } catch {
    cachedRegistry = {};
  }
  return cachedRegistry;
}

function normalizeHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

export function sourcesMatchRegistry(jurisdictionId, sources) {
  const registry = loadRegistry();
  const registrySources = normalizeSources(
    registry?.[jurisdictionId],
    registries
  ).official;
  if (registrySources.length === 0) return false;
  const allowedHosts = new Set(registrySources.map((source) => normalizeHost(source.url)));
  const normalized = normalizeSources(sources, registries).official;
  for (const source of normalized) {
    const host = normalizeHost(source.url);
    if (host && allowedHosts.has(host)) return true;
  }
  return false;
}
