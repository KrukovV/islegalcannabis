import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

async function fetchWithRetry(url, options, retries) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function getContentLength(url, retries) {
  try {
    const res = await fetchWithRetry(
      url,
      { method: "HEAD" },
      retries
    );
    const length = res.headers.get("content-length");
    if (!length) return null;
    const parsed = Number(length);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildRanges(totalBytes, segments) {
  const size = Math.ceil(totalBytes / segments);
  const ranges = [];
  for (let i = 0; i < segments; i += 1) {
    const start = i * size;
    if (start >= totalBytes) break;
    const end = Math.min(totalBytes - 1, start + size - 1);
    ranges.push({ start, end });
  }
  return ranges;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function download(url, options = {}) {
  const {
    segments = 4,
    retries = 2,
    outputDir
  } = options;
  const root = process.cwd();
  const targetDir =
    outputDir ?? path.join(root, "data", "sources_cache");
  fs.mkdirSync(targetDir, { recursive: true });

  const totalBytes = await getContentLength(url, retries);
  const useRanges = Number.isFinite(totalBytes) && segments > 1;

  let buffer;
  if (!useRanges || totalBytes === 0) {
    const res = await fetchWithRetry(url, {}, retries);
    buffer = Buffer.from(await res.arrayBuffer());
  } else {
    const ranges = buildRanges(totalBytes, segments);
    const chunks = [];
    for (const range of ranges) {
      const res = await fetchWithRetry(
        url,
        {
          headers: {
            Range: `bytes=${range.start}-${range.end}`
          }
        },
        retries
      );
      const part = Buffer.from(await res.arrayBuffer());
      if (res.status === 200 && ranges.length > 1) {
        chunks.length = 0;
        chunks.push(part);
        break;
      }
      chunks.push(part);
    }
    buffer = Buffer.concat(chunks);
  }

  const hash = sha256(buffer);
  const filePath = path.join(targetDir, `${hash}.bin`);
  fs.writeFileSync(filePath, buffer);

  return {
    path: filePath,
    bytes: buffer.length,
    sha256: hash
  };
}
