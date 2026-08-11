import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectOfficialSourceRecords,
  inspectPdf,
  runRevalidation,
  sha256,
} from "./revalidate_official_evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER_PATH = path.join(ROOT, "tools", "review", "revalidate_official_evidence.mjs");

function source(url, overrides = {}) {
  return {
    title: "Official law",
    url,
    source_owner_geo: "AA",
    applies_to_geo: ["AA"],
    source_authority: "Official Gazette",
    source_type: "CURRENT_PRIMARY_LAW",
    primary_or_context: "PRIMARY",
    current: true,
    effective: true,
    locator: "Article 1",
    exact_fragment: "cannabis exact fragment",
    screenshot_valid: true,
    ...overrides,
  };
}

function row(geo, sources, overrides = {}) {
  return {
    geo,
    independent_truth_color: "YELLOW",
    independent_truth_status: "LIMITED_LAWFUL_MODE",
    official_status: {
      recreational: "ILLEGAL",
      medical: "LIMITED",
      enforcement: "STRICT",
    },
    verified_sources: sources,
    ...overrides,
  };
}

function ledger(rows) {
  return {
    schema_version: "test",
    rows,
    audit_checkpoints: [],
  };
}

function stateByPath(result, suffix) {
  const record = result.records.find((entry) => entry.source.url.endsWith(suffix));
  assert(record, `missing record ${suffix}`);
  return record.source.revalidation;
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("304 preserves legal axes and does not create a color decision", async () => {
  const evidence = source("https://official.example/law", {
    revalidation: {
      checked_at: "2026-01-01T00:00:00.000Z",
      final_url: "https://official.example/law",
      http_status: 200,
      etag: '"v1"',
      last_modified: null,
      content_type: "text/html",
      content_length: 100,
      document_sha256: sha256("old document"),
      relevant_fragment_sha256: sha256("cannabis exact fragment"),
      revalidation_state: "NOT_MODIFIED",
      access_state: "HTTP_OK",
      change_reason: "BASELINE",
    },
  });
  const input = ledger([row("AA", [evidence])]);
  const legalBefore = structuredClone(input.rows[0].official_status);
  const colorBefore = input.rows[0].independent_truth_color;
  const result = await runRevalidation({
    ledger: input,
    geos: new Set(["AA"]),
    network: true,
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers["If-None-Match"], '"v1"');
      return new Response(null, { status: 304, headers: { etag: '"v1"' } });
    },
  });
  assert.equal(result.records[0].source.revalidation.revalidation_state, "NOT_MODIFIED");
  assert.deepEqual(input.rows[0].official_status, legalBefore);
  assert.equal(input.rows[0].independent_truth_color, colorBefore);
});

test("changed ETag or content hash queues only dependent GEO for C2", async () => {
  const changed = source("https://official.example/changed", {
    revalidation: {
      etag: '"old"',
      document_sha256: sha256("old"),
      relevant_fragment_sha256: sha256("cannabis exact fragment"),
      revalidation_state: "NOT_MODIFIED",
    },
  });
  const unchanged = source("https://official.example/unchanged", {
    source_owner_geo: "BB",
    applies_to_geo: ["BB"],
    revalidation: {
      etag: '"same"',
      document_sha256: sha256("cannabis exact fragment"),
      relevant_fragment_sha256: sha256("cannabis exact fragment"),
      revalidation_state: "NOT_MODIFIED",
    },
  });
  const input = ledger([row("AA", [changed]), row("BB", [unchanged])]);
  const result = await runRevalidation({
    ledger: input,
    network: true,
    fetchImpl: async (url) => new Response(
      url.endsWith("/changed") ? "new cannabis exact fragment" : "cannabis exact fragment",
      { status: 200, headers: { "content-type": "text/html", etag: url.endsWith("/changed") ? '"new"' : '"same"' } },
    ),
  });
  assert.equal(stateByPath(result, "/changed").revalidation_state, "CONTENT_CHANGED");
  assert.equal(stateByPath(result, "/unchanged").revalidation_state, "NOT_MODIFIED");
  assert.deepEqual(result.c2QueueGeos, ["AA"]);
});

test("changed ETag queues semantic review even when the document hash is stable", async () => {
  const body = "cannabis exact fragment";
  const evidence = source("https://official.example/etag-only", {
    revalidation: {
      etag: '"old"',
      document_sha256: sha256(body),
      relevant_fragment_sha256: sha256(body),
      revalidation_state: "NOT_MODIFIED",
    },
  });
  const result = await runRevalidation({
    ledger: ledger([row("AA", [evidence])]),
    network: true,
    fetchImpl: async () => new Response(body, {
      status: 200,
      headers: { "content-type": "text/html", etag: '"new"' },
    }),
  });
  assert.equal(result.records[0].source.revalidation.revalidation_state, "CONTENT_CHANGED");
  assert.deepEqual(result.c2QueueGeos, ["AA"]);
});

test("redirect to another owner requires review and never inherits applicability", async () => {
  const evidence = source("https://old-owner.example/law");
  const input = ledger([row("AA", [evidence])]);
  const result = await runRevalidation({
    ledger: input,
    network: true,
    fetchImpl: async () => ({
      status: 200,
      ok: true,
      redirected: true,
      url: "https://new-owner.example/law",
      headers: new Headers({ "content-type": "text/html" }),
      arrayBuffer: async () => Buffer.from("cannabis exact fragment"),
    }),
  });
  assert.equal(result.records[0].source.revalidation.revalidation_state, "REDIRECT_OR_OWNER_CHANGED");
  assert.deepEqual(result.records[0].source.applies_to_geo, ["AA"]);
  assert.equal(result.records[0].source.source_owner_geo, "AA");
});

test("WAF, timeout, 403 and blank viewer are access states, not legal conclusions", async () => {
  const paths = ["waf", "timeout", "forbidden", "blank"];
  const input = ledger([row("AA", paths.map((name) => source(`https://official.example/${name}`))) ]);
  const legalBefore = JSON.stringify({
    official: input.rows[0].official_status,
    color: input.rows[0].independent_truth_color,
  });
  const result = await runRevalidation({
    ledger: input,
    network: true,
    timeoutMs: 10,
    fetchImpl: async (url, options) => {
      if (url.endsWith("timeout")) {
        return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason)));
      }
      if (url.endsWith("forbidden")) return new Response("forbidden", { status: 403 });
      if (url.endsWith("blank")) return new Response(" ", { status: 200, headers: { "content-type": "text/html" } });
      return new Response("Checking your browser - Cloudflare", { status: 200, headers: { "content-type": "text/html" } });
    },
  });
  for (const name of paths) assert.equal(stateByPath(result, `/${name}`).revalidation_state, "ACCESS_BLOCKED");
  assert.equal(JSON.stringify({
    official: input.rows[0].official_status,
    color: input.rows[0].independent_truth_color,
  }), legalBefore);
});

test("text PDF uses pdftotext and renders only cannabis-relevant pages", () => {
  const calls = [];
  const result = inspectPdf({
    buffer: Buffer.from("fixture"),
    terms: ["cannabis"],
    commandRunner: (command, args) => {
      calls.push([command, args]);
      if (command === "pdftotext") {
        return { status: 0, stdout: `${"intro ".repeat(20)}\f${"law ".repeat(20)} cannabis exact fragment\f${"end ".repeat(20)}` };
      }
      if (command === "pdftoppm") return { status: 0, stdout: "" };
      throw new Error(`unexpected command ${command}`);
    },
  });
  assert.equal(result.extractor, "pdftotext");
  assert.equal(result.ocr_used, false);
  assert.deepEqual(result.relevant_pages, [2]);
  assert.deepEqual(result.rendered_pages, [2]);
  assert.equal(calls.filter(([command]) => command === "pdftoppm").length, 1);
  assert.equal(calls.some(([command]) => command.endsWith("ocr_pdf.sh")), false);
});

test("OCR is used only when the PDF has no usable text layer", () => {
  const calls = [];
  const result = inspectPdf({
    buffer: Buffer.from("scan"),
    terms: ["cannabis"],
    commandRunner: (command, args) => {
      calls.push([command, args]);
      if (command === "pdftotext") return { status: 0, stdout: "" };
      if (command.endsWith("ocr_pdf.sh")) {
        fs.writeFileSync(args[1], "cannabis exact fragment");
        return { status: 0, stdout: "" };
      }
      if (command === "pdftoppm") return { status: 0, stdout: "" };
      throw new Error(`unexpected command ${command}`);
    },
  });
  assert.equal(result.ocr_used, true);
  assert.equal(calls.filter(([command]) => command.endsWith("ocr_pdf.sh")).length, 1);
});

test("shared URL is fetched once and queues every linked GEO", async () => {
  const sharedUrl = "https://shared.example/law";
  const input = ledger([
    row("AA", [source(sharedUrl, { applies_to_geo: ["AA", "BB"] })]),
    row("BB", [source(sharedUrl, { source_owner_geo: "AA", applies_to_geo: ["AA", "BB"] })]),
  ]);
  let fetchCount = 0;
  const result = await runRevalidation({
    ledger: input,
    geos: new Set(["AA"]),
    network: true,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response("new cannabis exact fragment", { status: 200, headers: { "content-type": "text/html" } });
    },
  });
  assert.equal(fetchCount, 1);
  assert.equal(result.fetchedUrls.length, 1);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.c2QueueGeos, ["AA", "BB"]);
});

test("regulator e-licensing and visual metadata cannot mutate patient axes or Truth Color", async () => {
  const evidence = source("https://regulator.example/licensing", {
    source_type: "GENERIC_REGULATOR_E_LICENSING_PORTAL",
    cannabis_specific: false,
    screenshot_valid: false,
    official_domain_visible: true,
  });
  const input = ledger([row("AA", [evidence], {
    independent_truth_color: "YELLOW",
    independent_review: {
      axes: {
        patient_eligible: "UNKNOWN",
        prescriber_route: "UNKNOWN",
        lawful_supply: "UNKNOWN",
      },
    },
  })]);
  const before = structuredClone(input.rows[0].independent_review.axes);
  await runRevalidation({ ledger: input, network: false });
  assert.deepEqual(input.rows[0].independent_review.axes, before);
  assert.equal(input.rows[0].independent_truth_color, "YELLOW");
});

test("local HTTP fixture covers 304, unchanged, changed, redirect, timeout and WAF", async (t) => {
  let baseUrl = "";
  const server = http.createServer((request, response) => {
    const route = request.url;
    if (route === "/304") {
      response.writeHead(304, { etag: '"v1"' });
      response.end();
    } else if (route === "/unchanged") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("cannabis exact fragment");
    } else if (route === "/changed") {
      response.writeHead(200, { "content-type": "text/html", etag: '"v2"' });
      response.end("changed cannabis exact fragment");
    } else if (route === "/redirect") {
      response.writeHead(302, { location: `${baseUrl}/target` });
      response.end();
    } else if (route === "/target") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("cannabis exact fragment");
    } else if (route === "/timeout") {
      const timer = setTimeout(() => {
        if (!response.destroyed) response.end("late");
      }, 100);
      request.on("close", () => clearTimeout(timer));
    } else {
      response.writeHead(403, { "content-type": "text/html" });
      response.end("Cloudflare access denied");
    }
  });
  baseUrl = await listen(server);
  t.after(() => close(server));
  const make = (name, overrides = {}) => source(`${baseUrl}/${name}`, overrides);
  const input = ledger([row("AA", [
    make("304", { revalidation: { etag: '"v1"', document_sha256: sha256("old"), revalidation_state: "NOT_MODIFIED" } }),
    make("unchanged", { revalidation: { document_sha256: sha256("cannabis exact fragment"), revalidation_state: "NOT_MODIFIED" } }),
    make("changed", { revalidation: { document_sha256: sha256("old"), revalidation_state: "NOT_MODIFIED" } }),
    make("redirect"),
    make("timeout"),
    make("waf"),
  ])]);
  const result = await runRevalidation({ ledger: input, network: true, timeoutMs: 20 });
  assert.equal(stateByPath(result, "/304").revalidation_state, "NOT_MODIFIED");
  assert.equal(stateByPath(result, "/unchanged").revalidation_state, "NOT_MODIFIED");
  assert.equal(stateByPath(result, "/changed").revalidation_state, "CONTENT_CHANGED");
  assert.equal(stateByPath(result, "/redirect").revalidation_state, "REDIRECT_OR_OWNER_CHANGED");
  assert.equal(stateByPath(result, "/timeout").revalidation_state, "ACCESS_BLOCKED");
  assert.equal(stateByPath(result, "/waf").revalidation_state, "ACCESS_BLOCKED");
});

test("307-row fixture is deterministic and source identities never shrink", async () => {
  const rows = Array.from({ length: 307 }, (_unused, index) => {
    const geo = `G${String(index).padStart(3, "0")}`;
    return row(geo, [source(`https://official.example/${geo}`, {
      source_owner_geo: geo,
      applies_to_geo: [geo],
    })]);
  });
  const first = await runRevalidation({ ledger: ledger(rows), checkedAt: "2026-08-12T00:00:00.000Z" });
  const second = await runRevalidation({ ledger: ledger(rows), checkedAt: "2026-08-12T00:00:00.000Z" });
  assert.equal(first.sourceCount, 307);
  assert.equal(second.sourceCount, 307);
  assert.deepEqual(
    first.records.map((record) => record.dedupeKey),
    second.records.map((record) => record.dedupeKey),
  );
});

test("dry-run performs no HTTP request and no ledger, matrix, legal or color mutation", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-revalidation-test-"));
  try {
    const ledgerPath = path.join(tempDir, "ledger.json");
    const matrixPath = path.join(tempDir, "matrix.json");
    const input = ledger(Array.from({ length: 307 }, (_unused, index) => {
      const geo = `G${String(index).padStart(3, "0")}`;
      return row(geo, index === 0 ? [source("http://127.0.0.1:1/must-not-fetch", {
        source_owner_geo: geo,
        applies_to_geo: [geo],
      })] : []);
    }));
    fs.writeFileSync(ledgerPath, `${JSON.stringify(input, null, 2)}\n`);
    fs.writeFileSync(matrixPath, `${JSON.stringify({ rows: input.rows.map(({ geo }) => ({ geo })) }, null, 2)}\n`);
    const beforeLedger = crypto.createHash("sha256").update(fs.readFileSync(ledgerPath)).digest("hex");
    const beforeMatrix = crypto.createHash("sha256").update(fs.readFileSync(matrixPath)).digest("hex");
    const result = spawnSync(process.execPath, [RUNNER_PATH, "--dry-run", "--ledger", ledgerPath, "--matrix", matrixPath], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY_RUN=1/);
    assert.match(result.stdout, /FETCHED_URLS=0/);
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(ledgerPath)).digest("hex"), beforeLedger);
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(matrixPath)).digest("hex"), beforeMatrix);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("current matrix remains exactly 307 GEO and uses only canonical Truth Colors", () => {
  const matrix = JSON.parse(fs.readFileSync(
    path.join(ROOT, "data", "reviews", "wiki-truth-cannabis-law-matrix-307.json"),
    "utf8",
  ));
  assert.equal(matrix.rows.length, 307);
  assert.equal(new Set(matrix.rows.map((entry) => entry.geo)).size, 307);
  const allowed = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);
  for (const entry of matrix.rows) {
    if (entry.independentTruth) assert(allowed.has(entry.independentTruth.color));
  }
});

test("all collected current source records receive the complete revalidation schema", async () => {
  const input = ledger([row("AA", [source("https://official.example/law")])]);
  const result = await runRevalidation({ ledger: input });
  assert.equal(collectOfficialSourceRecords(input).length, 1);
  const metadata = result.records[0].source.revalidation;
  for (const field of [
    "checked_at",
    "final_url",
    "http_status",
    "etag",
    "last_modified",
    "content_type",
    "content_length",
    "document_sha256",
    "relevant_fragment_sha256",
    "revalidation_state",
    "access_state",
    "change_reason",
  ]) assert(Object.hasOwn(metadata, field), `missing ${field}`);
});

test("canonical ledger persists revalidation state on every collected current official source", () => {
  const canonicalLedger = JSON.parse(fs.readFileSync(
    path.join(ROOT, "data", "official", "cannabis_law_visual_reviews.audit.json"),
    "utf8",
  ));
  const records = collectOfficialSourceRecords(canonicalLedger);
  assert(records.length > 307);
  for (const record of records) {
    assert(record.source.revalidation, `${record.rowGeo}:${record.sourcePath}`);
    assert(
      [
        "NOT_MODIFIED",
        "CONTENT_CHANGED",
        "REDIRECT_OR_OWNER_CHANGED",
        "EFFECTIVE_DATE_REVIEW_DUE",
        "ACCESS_BLOCKED",
        "NEEDS_SEMANTIC_REVIEW",
        "NEEDS_VISUAL_REVIEW",
      ].includes(record.source.revalidation.revalidation_state),
      `${record.rowGeo}:${record.sourcePath}:state`,
    );
  }
});

test("resolver and revalidation runner contain no GEO-specific branch or color allowlist", () => {
  const files = [
    RUNNER_PATH,
    path.join(ROOT, "apps", "web", "src", "lib", "wikiTruthColorComparison.ts"),
    path.join(ROOT, "apps", "web", "src", "lib", "wikiTruthColorEngine.js"),
  ];
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(text, /if\s*\(\s*(?:row\.)?geo\s*===/);
    assert.doesNotMatch(text, /(?:GREEN|YELLOW|RED)_GEO_(?:ALLOWLIST|OVERRIDE)/i);
  }
});
