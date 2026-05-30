import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateProdLiveReport } from "./prod_live_quality_gate.mjs";

const ROOT = process.cwd();

function makePngLikeFile(dir, name, bytes = 12000) {
  const filePath = path.join(dir, name);
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = Buffer.alloc(Math.max(0, bytes - header.length), 1);
  fs.writeFileSync(filePath, Buffer.concat([header, body]));
  return filePath;
}

function baseline(overrides = {}) {
  return {
    required_methods: ["method1_extra_http_headers", "method2_api_cookie_seed"],
    required_title: "Is cannabis legal?",
    require_no_access_block: true,
    require_new_map_root: true,
    require_map_surface: true,
    require_map_ready: true,
    require_canvas: true,
    min_screenshot_bytes: 10000,
    max_elapsed_ms: 90000,
    max_map_ready_ms: 60000,
    method_overrides: {
      method2_api_cookie_seed: {
        seed_status_min: 200,
        seed_status_max: 399
      }
    },
    ...overrides
  };
}

function goodResult(method, screenshot, overrides = {}) {
  return {
    method,
    ok: true,
    title: "Is cannabis legal?",
    has_access_block: false,
    has_new_map_root: true,
    has_map_surface: true,
    has_map_ready: true,
    has_canvas: true,
    screenshot,
    elapsed_ms: 8000,
    metrics: {
      elapsed_ms: 8000,
      root_ms: 2000,
      map_surface_ms: 2400,
      map_ready_ms: 4200,
      canvas_ms: 2600,
      screenshot_bytes: 12000
    },
    ...overrides
  };
}

test("prod live gate accepts both support-provided bypass methods with screenshots and timings", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-prod-live-gate-ok-"));
  const method1Shot = makePngLikeFile(tmp, "method1.png");
  const method2Shot = makePngLikeFile(tmp, "method2.png");
  const report = {
    missing_secret: false,
    results: [
      goodResult("method1_extra_http_headers", method1Shot),
      goodResult("method2_api_cookie_seed", method2Shot, { seed_status: 200 })
    ]
  };

  const evaluation = await evaluateProdLiveReport({ report, baseline: baseline(), root: ROOT });

  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.failures.length, 0);
  assert.equal(evaluation.methods.length, 2);
  assert.equal(evaluation.methods.every((method) => method.screenshot_exists), true);
});

test("prod live gate fails on Vercel access block and missing map readiness", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-prod-live-gate-block-"));
  const method1Shot = makePngLikeFile(tmp, "method1.png");
  const method2Shot = makePngLikeFile(tmp, "method2.png");
  const report = {
    missing_secret: false,
    results: [
      goodResult("method1_extra_http_headers", method1Shot, {
        ok: false,
        title: "Vercel Security Checkpoint",
        has_access_block: true,
        has_map_ready: false,
        metrics: {
          elapsed_ms: 8000,
          root_ms: null,
          map_surface_ms: null,
          map_ready_ms: null,
          canvas_ms: null,
          screenshot_bytes: 12000
        }
      }),
      goodResult("method2_api_cookie_seed", method2Shot, { seed_status: 200 })
    ]
  };

  const evaluation = await evaluateProdLiveReport({ report, baseline: baseline(), root: ROOT });

  assert.equal(evaluation.ok, false);
  assert.match(evaluation.failures.join("\n"), /method1_extra_http_headers:ACCESS_BLOCK/);
  assert.match(evaluation.failures.join("\n"), /method1_extra_http_headers:NO_MAP_READY/);
});

test("prod live gate fails on degraded timing and undersized screenshot", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-prod-live-gate-degraded-"));
  const method1Shot = makePngLikeFile(tmp, "method1.png", 512);
  const method2Shot = makePngLikeFile(tmp, "method2.png");
  const report = {
    missing_secret: false,
    results: [
      goodResult("method1_extra_http_headers", method1Shot, {
        metrics: {
          elapsed_ms: 95000,
          root_ms: 2000,
          map_surface_ms: 2400,
          map_ready_ms: 65000,
          canvas_ms: 2600,
          screenshot_bytes: 512
        }
      }),
      goodResult("method2_api_cookie_seed", method2Shot, { seed_status: 200 })
    ]
  };

  const evaluation = await evaluateProdLiveReport({ report, baseline: baseline(), root: ROOT });

  assert.equal(evaluation.ok, false);
  assert.match(evaluation.failures.join("\n"), /SCREENSHOT_TOO_SMALL/);
  assert.match(evaluation.failures.join("\n"), /ELAPSED_MS_DEGRADED/);
  assert.match(evaluation.failures.join("\n"), /MAP_READY_MS_DEGRADED/);
});
