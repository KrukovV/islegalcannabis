import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps", "packages"].map((p) => path.join(ROOT, p));
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "__snapshots__"
]);

const isTsFile = (filePath) =>
  filePath.endsWith(".ts") || filePath.endsWith(".tsx");

function shouldExcludeDir(dirPath) {
  const parts = dirPath.split(path.sep);
  return parts.some((part) => EXCLUDE_DIRS.has(part));
}

function isInSharedPackage(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  return normalized.includes("/packages/shared/");
}

function isInAppsWebSrc(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  return normalized.includes("/apps/web/src/");
}

function isInSrc(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  return normalized.includes("/src/");
}

function listFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldExcludeDir(fullPath)) continue;
      results.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function lineForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

function report(file, index, message) {
  const text = fs.readFileSync(file, "utf-8");
  const line = lineForIndex(text, index);
  console.error(`${file}:${line} ${message}`);
}

function main() {
  const files = SCAN_ROOTS.flatMap((root) => {
    if (!fs.existsSync(root)) return [];
    return listFiles(root);
  })
    .filter(isTsFile)
    .filter(isInSrc)
    .filter((file) => !isInSharedPackage(file));

  const typeRegexes = [
    /^(\s*)(export\s+)?type\s+ResultStatusLevel\s*=/m,
    /^(\s*)type\s+StatusLevel\s*=/m
  ];

  const unionRegex = /(["']green["'])\s*\|\s*(["']yellow["'])\s*\|\s*(["']red["'])(\s*\|\s*(["']gray["']))?/m;
  const sharedImportRegex = /from\s+["'][^"']*shared[^"']*["']/;

  let hasErrors = false;

  for (const file of files) {
    const text = fs.readFileSync(file, "utf-8");

    for (const regex of typeRegexes) {
      const match = text.match(regex);
      if (match?.index !== undefined) {
        report(
          file,
          match.index,
          "Не объявляйте ResultStatusLevel в apps/* — используйте импорт из packages/shared."
        );
        hasErrors = true;
      }
    }

    const unionMatch = text.match(unionRegex);
    if (unionMatch?.index !== undefined) {
      report(
        file,
        unionMatch.index,
        "Не объявляйте локальные union-статусы — используйте ResultStatusLevel из packages/shared."
      );
      hasErrors = true;
    }

    if (isInAppsWebSrc(file) && text.includes("ResultStatusLevel")) {
      if (!sharedImportRegex.test(text)) {
        const idx = text.indexOf("ResultStatusLevel");
        report(
          file,
          idx,
          "Не объявляйте ResultStatusLevel в apps/* — используйте импорт из packages/shared."
        );
        hasErrors = true;
      }
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}

main();
