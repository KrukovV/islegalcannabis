/* global URL */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import { promisify } from "node:util";
import { latLngToCell } from "h3-js";

const execFileAsync = promisify(execFile);
const baseUrl = process.env.SOCIAL_LOAD_BASE_URL || "http://127.0.0.1:3000";
const reportPath = process.env.SOCIAL_LOAD_HTTP11_REPORT || null;

function discussionsUrl(cell) {
  const url = new URL("/api/social/discussions", baseUrl);
  url.searchParams.set("type", "MAP");
  url.searchParams.set("cells", cell);
  url.searchParams.set("sort", "NEW");
  url.searchParams.set("limit", "30");
  return url.toString();
}

function parseInteger(stdout, label) {
  const match = stdout.match(new RegExp(`^${label}:\\s+(\\d+)`, "m"));
  if (!match) throw new Error(`SOCIAL_AB_FIELD_MISSING:${label}`);
  return Number(match[1]);
}

function parseFloatField(stdout, label) {
  const match = stdout.match(new RegExp(`^${label}:\\s+([0-9.]+)`, "m"));
  if (!match) throw new Error(`SOCIAL_AB_FIELD_MISSING:${label}`);
  return Number(match[1]);
}

function percentile(stdout, value) {
  const match = stdout.match(new RegExp(`^\\s*${value}%\\s+(\\d+)`, "m"));
  if (!match) throw new Error(`SOCIAL_AB_PERCENTILE_MISSING:${value}`);
  return Number(match[1]);
}

async function runAb({ name, requests, concurrency, cell }) {
  const { stdout } = await execFileAsync("/usr/sbin/ab", [
    "-n", String(requests),
    "-c", String(concurrency),
    "-s", "60",
    discussionsUrl(cell),
  ], { maxBuffer: 2 * 1024 * 1024 });
  return {
    name,
    cell,
    requests: parseInteger(stdout, "Complete requests"),
    failedRequests: parseInteger(stdout, "Failed requests"),
    requestsPerSecond: parseFloatField(stdout, "Requests per second"),
    p50Ms: percentile(stdout, 50),
    p95Ms: percentile(stdout, 95),
    p99Ms: percentile(stdout, 99),
    maxMs: percentile(stdout, 100),
  };
}

const hotCell = latLngToCell(40.7128, -74.006, 4);
const coldCells = Array.from({ length: 10 }, (_, index) => latLngToCell(
  -55 + index * 11,
  -160 + index * 31,
  4,
));

const hot = await runAb({ name: "hot_cell", requests: 1_000, concurrency: 1_000, cell: hotCell });
const coldShards = await Promise.all(coldCells.map((cell, index) => runAb({
  name: `cold_cell_${index + 1}`,
  requests: 100,
  concurrency: 100,
  cell,
})));
const cold = {
  cells: coldShards.length,
  requests: coldShards.reduce((sum, shard) => sum + shard.requests, 0),
  configuredConcurrency: coldShards.length * 100,
  failedRequests: coldShards.reduce((sum, shard) => sum + shard.failedRequests, 0),
  aggregateRequestsPerSecond: Number(coldShards.reduce((sum, shard) => sum + shard.requestsPerSecond, 0).toFixed(2)),
  worstP50Ms: Math.max(...coldShards.map((shard) => shard.p50Ms)),
  worstP95Ms: Math.max(...coldShards.map((shard) => shard.p95Ms)),
  worstP99Ms: Math.max(...coldShards.map((shard) => shard.p99Ms)),
  worstMaxMs: Math.max(...coldShards.map((shard) => shard.maxMs)),
};
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  client: "ApacheBench 2.3 HTTP/1.1",
  hot,
  cold,
  pass: hot.requests === 1_000
    && hot.failedRequests === 0
    && cold.requests === 1_000
    && cold.configuredConcurrency === 1_000
    && cold.failedRequests === 0,
};

if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report)}\n`);
if (!report.pass) process.exitCode = 1;
