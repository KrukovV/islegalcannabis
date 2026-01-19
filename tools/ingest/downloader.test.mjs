import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import crypto from "node:crypto";
import { download } from "./downloader.mjs";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

test("download uses multiple ranges and returns sha256", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-dl-"));
  const filePath = path.join(tempDir, "fixture.bin");
  const payload = Buffer.from("a".repeat(8192));
  fs.writeFileSync(filePath, payload);

  let rangeRequests = 0;

  const server = http.createServer((req, res) => {
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Length": payload.length });
      res.end();
      return;
    }

    const range = req.headers.range;
    if (range) {
      rangeRequests += 1;
      const match = String(range).match(/bytes=(\d+)-(\d+)/);
      if (match) {
        const start = Number(match[1]);
        const end = Number(match[2]);
        const slice = payload.slice(start, end + 1);
        res.writeHead(206, {
          "Content-Length": slice.length,
          "Content-Range": `bytes ${start}-${end}/${payload.length}`,
          "Accept-Ranges": "bytes"
        });
        res.end(slice);
        return;
      }
    }

    res.writeHead(200, { "Content-Length": payload.length });
    res.end(payload);
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/fixture.bin`;

  const result = await download(url, {
    segments: 4,
    retries: 1,
    outputDir: tempDir
  });

  server.close();

  assert.equal(result.bytes, payload.length);
  assert.equal(result.sha256, sha256(payload));
  assert.ok(fs.existsSync(result.path));
  assert.ok(rangeRequests > 1);
});
