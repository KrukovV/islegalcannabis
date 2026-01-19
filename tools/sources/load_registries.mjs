import fs from "node:fs";
import path from "node:path";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export function loadSourceRegistries(root = process.cwd()) {
  const officialPath = path.join(root, "data", "sources", "official_registry.json");
  const neutralPath = path.join(root, "data", "sources", "neutral_registry.json");
  return {
    officialRegistry: readJson(officialPath),
    neutralRegistry: readJson(neutralPath)
  };
}
