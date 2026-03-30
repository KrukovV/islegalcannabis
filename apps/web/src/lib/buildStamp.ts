import fs from "node:fs";
import path from "node:path";
import { cache } from "react";

export type BuildStamp = {
  buildId: string;
  buildSha: string;
  buildTime: string;
};

const BUILD_TIME_GLOBAL_KEY = "__ILC_PROCESS_BUILD_TIME__";
const processGlobals = globalThis as typeof globalThis & {
  __ILC_PROCESS_BUILD_TIME__?: string;
};

if (!processGlobals[BUILD_TIME_GLOBAL_KEY]) {
  processGlobals[BUILD_TIME_GLOBAL_KEY] =
    process.env.BUILD_TIME ||
    process.env.VERCEL_GIT_COMMIT_TIMESTAMP ||
    process.env.NEXT_BUILD_TIME ||
    new Date().toISOString();
}

const PROCESS_BUILD_TIME = String(processGlobals[BUILD_TIME_GLOBAL_KEY] || "UNCONFIRMED");

function readFirstNonEmpty(candidates: string[]) {
  for (const file of candidates) {
    try {
      const value = fs.readFileSync(file, "utf8").trim();
      if (value) return value;
    } catch {
      // keep scanning
    }
  }
  return null;
}

function readGitHeadSha(root: string) {
  const headPath = path.join(root, ".git", "HEAD");
  try {
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (!head) return null;
    if (!head.startsWith("ref:")) return head.slice(0, 7);
    const refName = head.slice(5).trim();
    const refPath = path.join(root, ".git", refName);
    const refValue = readFirstNonEmpty([refPath]);
    if (refValue) return refValue.slice(0, 7);

    const packedRefsPath = path.join(root, ".git", "packed-refs");
    try {
      const packedRefs = fs.readFileSync(packedRefsPath, "utf8");
      for (const line of packedRefs.split(/\r?\n/)) {
        if (!line || line.startsWith("#") || line.startsWith("^")) continue;
        const [sha, packedRef] = line.trim().split(/\s+/);
        if (packedRef === refName && sha) return sha.slice(0, 7);
      }
    } catch {
      // packed-refs is optional
    }
  } catch {
    return null;
  }
  return null;
}

function findGitRoot(start: string) {
  let current = start;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return start;
}

function resolveBuildId(root: string) {
  return (
    readFirstNonEmpty([path.join(root, ".next", "BUILD_ID"), path.join(root, "apps", "web", ".next", "BUILD_ID")]) ||
    process.env.NEXT_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "dev"
  );
}

export const getBuildStamp = cache((): BuildStamp => {
  const root = findGitRoot(process.cwd());
  return {
    buildId: String(resolveBuildId(root)),
    buildSha: String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || readGitHeadSha(root) || "unknown"),
    buildTime: PROCESS_BUILD_TIME
  };
});
