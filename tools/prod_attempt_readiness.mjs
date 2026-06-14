#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = process.env.PROD_ATTEMPT_RUN_ID || new Date().toISOString().replace(/[-:.]/g, "").replace("T", "").slice(0, 14);
const reportDir = path.join(repoRoot, "Reports", "ProdAudit", "readiness", runId);
const latestReadinessPath = path.join(repoRoot, "Reports", "ProdAudit", "prod-attempt-readiness.json");
const hypothesis = String(process.env.PROD_ACCESS_HYPOTHESIS || process.env.HYPOTHESIS || "").trim();
const attemptBudget = Number(process.env.PROD_ACCESS_ATTEMPT_BUDGET || process.env.ATTEMPT_BUDGET || 1) || 0;
const localTarget = String(process.env.PROD_ATTEMPT_LOCAL_TARGET || "http://127.0.0.1:3000").replace(/\/$/, "");
const localBrowser = String(process.env.PROD_ATTEMPT_LOCAL_BROWSER || process.env.PROD_ACCESS_BROWSER || "chrome").trim().toLowerCase();
const localReplayRunId = `local-replay-${runId}`;
const localReplaySummaryPath = path.join(repoRoot, "Reports", "ProdAudit", "popup-matrix", localReplayRunId, "summary.json");
const localUiReportDir = path.join(repoRoot, "Reports", "LocalUI");
const localUiPidPath = path.join(localUiReportDir, "next-dev.pid");
const localUiLogPath = path.join(localUiReportDir, "next-dev.log");
const nextDevLockPath = path.join(repoRoot, "apps", "web", ".next", "dev", "lock");
const localUiPort = Number(new URL(localTarget).port || 3000);
const localPopupReplayTimeoutMs = 8 * 60 * 1000;
const localPopupReplayPassGraceMs = 5000;

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return await fs.readFile(filePath, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => null);
}

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

function commandText(command, args) {
  return [command, ...args].join(" ");
}

function runCommand({ id, command, args, cwd = repoRoot, env = {}, timeoutMs = 10 * 60 * 1000 }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let timedOut = false;
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000).unref();
    }, timeoutMs);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", async (code) => {
      clearTimeout(timeout);
      const logPath = path.join(reportDir, `${id}.log`);
      await fs.writeFile(logPath, `${stdout}${stderr ? `\nSTDERR:\n${stderr}` : ""}`, "utf8").catch(() => undefined);
      resolve({
        id,
        command: commandText(command, args),
        cwd: rel(cwd),
        status: code === 0 && !timedOut ? "PASS" : "FAIL",
        rc: timedOut ? 124 : code,
        timed_out: timedOut,
        duration_ms: Date.now() - startedAt,
        log_path: rel(logPath)
      });
    });
  });
}

function captureCommand(command, args, cwd = repoRoot) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        command: commandText(command, args),
        rc: 127,
        stdout,
        stderr: `${stderr}${error.message}`
      });
    });
    child.on("close", (code) => {
      resolve({
        command: commandText(command, args),
        rc: code,
        stdout,
        stderr
      });
    });
  });
}

async function lockSnapshot() {
  const stat = await fs.stat(nextDevLockPath).catch(() => null);
  return {
    path: rel(nextDevLockPath),
    exists: Boolean(stat),
    size: stat?.size ?? 0,
    mtime: stat?.mtime?.toISOString?.() || ""
  };
}

async function checkPortOwnership() {
  const captured = await captureCommand("lsof", ["-nP", `-iTCP:${localUiPort}`, "-sTCP:LISTEN"]);
  const lines = captured.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  const listeners = lines.slice(1).map((line) => {
    const parts = line.split(/\s+/);
    return {
      command: parts[0] || "",
      pid: parts[1] || "",
      user: parts[2] || "",
      raw: line
    };
  });
  const payload = {
    generated_at: new Date().toISOString(),
    port: localUiPort,
    command: captured.command,
    rc: captured.rc,
    busy: listeners.length > 0,
    listeners,
    stderr: captured.stderr.trim()
  };
  await writeJson(path.join(localUiReportDir, "port-check.json"), payload);
  return payload;
}

async function checkNextDevProcess() {
  const captured = await captureCommand("ps", ["-axo", "pid=,command="]);
  const ownPid = String(process.pid);
  const processes = captured.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return {
        pid: match?.[1] || "",
        command: match?.[2] || line
      };
    })
    .filter((item) => item.pid !== ownPid)
    .filter((item) => {
      const command = item.command;
      return (
        /next dev/i.test(command) ||
        /next-dev/i.test(command) ||
        (/node/i.test(command) && /next/i.test(command) && /dev/i.test(command) && /3000|apps\/web|127\.0\.0\.1/.test(command)) ||
        (/npm/i.test(command) && /web:dev|run dev/i.test(command) && /apps\/web|isLegal/.test(command))
      );
    });
  const payload = {
    generated_at: new Date().toISOString(),
    command: captured.command,
    rc: captured.rc,
    alive: processes.length > 0,
    processes,
    stderr: captured.stderr.trim()
  };
  await writeJson(path.join(localUiReportDir, "process-check.json"), payload);
  return payload;
}

async function probeLocalUi() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${localTarget}/new-map?qa=1`, {
      method: "GET",
      signal: controller.signal
    });
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      url: `${localTarget}/new-map?qa=1`
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url: `${localTarget}/new-map?qa=1`,
      error: String(error?.message || error || "LOCAL_UI_UNAVAILABLE")
    };
  } finally {
    clearTimeout(timeout);
  }
}

function startNextDevDetached() {
  return new Promise((resolve) => {
    const out = fs.open(localUiLogPath, "a");
    Promise.resolve(out).then(async (handle) => {
      const child = spawn("npm", ["run", "web:dev"], {
        cwd: path.join(repoRoot, "apps", "web"),
        env: {
          ...process.env,
          NEXT_DISABLE_TURBOPACK: "1"
        },
        detached: true,
        stdio: ["ignore", handle.fd, handle.fd]
      });
      child.unref();
      await fs.writeFile(localUiPidPath, `${child.pid}\n`, "utf8");
      await handle.close();
      resolve({
        started: true,
        pid: child.pid,
        log_path: rel(localUiLogPath),
        pid_path: rel(localUiPidPath)
      });
    }).catch((error) => {
      resolve({
        started: false,
        error: String(error?.message || error || "START_FAILED")
      });
    });
  });
}

async function waitForLocalUiReady(timeoutMs = 120000) {
  const startedAt = Date.now();
  let lastProbe = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastProbe = await probeLocalUi();
    if (lastProbe.ok) {
      return {
        ready: true,
        waited_ms: Date.now() - startedAt,
        probe: lastProbe
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return {
    ready: false,
    waited_ms: Date.now() - startedAt,
    probe: lastProbe
  };
}

async function ensureLocalUiReady() {
  await ensureDir(localUiReportDir);
  const initialProbe = await probeLocalUi();
  const lock = await lockSnapshot();
  const port = await checkPortOwnership();
  const processCheck = await checkNextDevProcess();
  let staleLock = false;
  let activeLock = false;
  let recovery = null;
  let start = null;
  let finalProbe = initialProbe;

  if (initialProbe.ok) {
    const payload = {
      generated_at: new Date().toISOString(),
      LOCAL_UI_READY: "YES",
      LOCAL_UI_START_FAILED: "",
      local_target: localTarget,
      lock,
      port,
      process: processCheck,
      initial_probe: initialProbe,
      final_probe: finalProbe,
      active_lock: Boolean(lock.exists && port.busy && processCheck.alive),
      stale_lock: false,
      recovery,
      start
    };
    await writeJson(path.join(localUiReportDir, "startup.json"), payload);
    return payload;
  }

  activeLock = Boolean(lock.exists && port.busy && processCheck.alive);
  staleLock = Boolean(lock.exists && !port.busy && !processCheck.alive);
  if (activeLock) {
    const ready = await waitForLocalUiReady(60000);
    finalProbe = ready.probe || initialProbe;
    if (ready.ready) {
      const payload = {
        generated_at: new Date().toISOString(),
        LOCAL_UI_READY: "YES",
        LOCAL_UI_START_FAILED: "",
        local_target: localTarget,
        lock,
        port,
        process: processCheck,
        initial_probe: initialProbe,
        final_probe: finalProbe,
        active_lock: true,
        stale_lock: false,
        recovery,
        start,
        wait: {
          ready: true,
          waited_ms: ready.waited_ms,
          owner: "existing_next_dev"
        }
      };
      await writeJson(path.join(localUiReportDir, "startup.json"), payload);
      return payload;
    }
    const payload = {
      generated_at: new Date().toISOString(),
      LOCAL_UI_READY: "NO",
      LOCAL_UI_START_FAILED: "AUTOSTART_FORBIDDEN_ACTIVE_LOCK",
      local_target: localTarget,
      lock,
      port,
      process: processCheck,
      initial_probe: initialProbe,
      final_probe: finalProbe,
      active_lock: true,
      stale_lock: false,
      recovery,
      start,
      wait: {
        ready: false,
        waited_ms: ready.waited_ms,
        owner: "existing_next_dev"
      }
    };
    await writeJson(path.join(localUiReportDir, "startup.json"), payload);
    return payload;
  }

  if (staleLock) {
    const stalePayload = {
      generated_at: new Date().toISOString(),
      stale_lock: true,
      lock,
      port,
      process: processCheck,
      action: "REMOVE_STALE_LOCK"
    };
    await writeJson(path.join(localUiReportDir, "stale-lock.json"), stalePayload);
    await fs.unlink(nextDevLockPath);
    recovery = {
      stale_lock_removed: true,
      stale_lock_path: rel(nextDevLockPath)
    };
  }

  if (port.busy && !processCheck.alive) {
    const payload = {
      generated_at: new Date().toISOString(),
      LOCAL_UI_READY: "NO",
      LOCAL_UI_START_FAILED: "PORT_BUSY_UNKNOWN_OWNER",
      local_target: localTarget,
      lock,
      port,
      process: processCheck,
      initial_probe: initialProbe,
      final_probe: finalProbe,
      active_lock: activeLock,
      stale_lock: staleLock,
      recovery,
      start
    };
    await writeJson(path.join(localUiReportDir, "startup.json"), payload);
    return payload;
  }

  start = await startNextDevDetached();
  const ready = start.started ? await waitForLocalUiReady() : {
    ready: false,
    waited_ms: 0,
    probe: initialProbe
  };
  finalProbe = ready.probe || initialProbe;
  const payload = {
    generated_at: new Date().toISOString(),
    LOCAL_UI_READY: ready.ready ? "YES" : "NO",
    LOCAL_UI_START_FAILED: ready.ready ? "" : (start.error || "LOCAL_UI_START_TIMEOUT"),
    local_target: localTarget,
    lock,
    port,
    process: processCheck,
    initial_probe: initialProbe,
    final_probe: finalProbe,
    active_lock: activeLock,
    stale_lock: staleLock,
    recovery,
    start,
    wait: {
      ready: ready.ready,
      waited_ms: ready.waited_ms
    }
  };
  await writeJson(path.join(localUiReportDir, "startup.json"), payload);
  return payload;
}

function localReplayEvidence(summary) {
  const rows = Array.isArray(summary?.rows) ? summary.rows : [];
  const rowByGeo = Object.fromEntries(rows.map((row) => [row.geo, row]));
  const kosovo = rowByGeo.XK || null;
  const frenchGuiana = rowByGeo.GF || null;
  return {
    pass: Boolean(summary?.PASS),
    summary_path: rel(localReplaySummaryPath),
    browser: summary?.browser || localBrowser,
    matrix_count: summary?.matrix_count || rows.length,
    pass_count: summary?.pass_count || rows.filter((row) => row.status === "PASS").length,
    territory_matrix_pass: Boolean(summary?.PASS),
    kosovo_popup: kosovo?.status === "PASS" && Boolean(kosovo?.screenshots?.popup),
    french_guiana_popup: frenchGuiana?.status === "PASS" && Boolean(frenchGuiana?.screenshots?.popup),
    kosovo_popup_path: kosovo?.screenshots?.popup || "",
    french_guiana_popup_path: frenchGuiana?.screenshots?.popup || "",
    failed_geos: rows.filter((row) => row.status !== "PASS").map((row) => row.geo)
  };
}

function isLocalReplaySummaryPass(summary) {
  const evidence = localReplayEvidence(summary);
  return Boolean(
    evidence.pass &&
      evidence.kosovo_popup &&
      evidence.french_guiana_popup &&
      evidence.territory_matrix_pass
  );
}

function runLocalPopupReplay() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let timedOut = false;
    let passSummaryObserved = false;
    let passSummaryObservedAt = 0;
    let cleanupRequested = false;
    let stdout = "";
    let stderr = "";
    const command = process.execPath;
    const args = ["tools/prod_popup_matrix_audit.mjs"];
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        VERCEL_AUTOMATION_BYPASS_SECRET: "",
        PROD_POPUP_TARGET: localTarget,
        PROD_POPUP_RUN_ID: localReplayRunId,
        PROD_POPUP_BROWSER: localBrowser,
        PROD_POPUP_ACCESS_MODE: "none",
        RUNNER_MODE: "LONG_LIVED"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const cleanupChild = () => {
      if (cleanupRequested) return;
      cleanupRequested = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000).unref();
    };
    const timeout = setTimeout(() => {
      if (!passSummaryObserved) timedOut = true;
      cleanupChild();
    }, localPopupReplayTimeoutMs);
    const poll = setInterval(async () => {
      const summary = await readJson(localReplaySummaryPath);
      if (!isLocalReplaySummaryPass(summary)) return;
      passSummaryObserved = true;
      if (!passSummaryObservedAt) passSummaryObservedAt = Date.now();
      if (Date.now() - passSummaryObservedAt >= localPopupReplayPassGraceMs) {
        cleanupChild();
      }
    }, 1000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", async (code) => {
      clearTimeout(timeout);
      clearInterval(poll);
      const logPath = path.join(reportDir, "local_popup_replay.log");
      await fs.writeFile(logPath, `${stdout}${stderr ? `\nSTDERR:\n${stderr}` : ""}`, "utf8").catch(() => undefined);
      const status = (code === 0 || passSummaryObserved) && !timedOut ? "PASS" : "FAIL";
      resolve({
        id: "local_popup_replay",
        command: commandText(command, args),
        cwd: rel(repoRoot),
        status,
        rc: status === "PASS" ? 0 : (timedOut ? 124 : code),
        timed_out: timedOut,
        pass_summary_observed: passSummaryObserved,
        cleanup_requested: cleanupRequested,
        duration_ms: Date.now() - startedAt,
        log_path: rel(logPath)
      });
    });
  });
}

async function main() {
  await ensureDir(reportDir);
  const generatedAt = new Date().toISOString();
  const gates = [];
  const earlyFailures = [];

  if (attemptBudget !== 1) {
    earlyFailures.push({
      id: "attempt_budget",
      status: "FAIL",
      reason: "ATTEMPT_BUDGET_MUST_BE_1",
      actual: attemptBudget
    });
  }
  if (!hypothesis) {
    earlyFailures.push({
      id: "hypothesis",
      status: "FAIL",
      reason: "HYPOTHESIS_MISSING"
    });
  }

  const localUiStartup = await ensureLocalUiReady();
  const localProbe = localUiStartup.final_probe || await probeLocalUi();
  if (localUiStartup.LOCAL_UI_READY !== "YES") {
    earlyFailures.push({
      id: "local_ui",
      status: "FAIL",
      reason: localUiStartup.LOCAL_UI_START_FAILED || "LOCAL_UI_START_FAILED",
      probe: localProbe
    });
  }

  if (earlyFailures.length === 0) {
    const gateCommands = [
      { id: "node_check", command: process.execPath, args: ["--check", "tools/prod_access_recovery.mjs"] },
      { id: "vercel_bypass_test", command: process.execPath, args: ["--test", "tools/vercel_bypass.test.mjs"] },
      { id: "prod_live_quality_gate_test", command: process.execPath, args: ["--test", "tools/prod_live_quality_gate.test.mjs"] },
      {
        id: "maproot_create_map_tests",
        command: "npm",
        args: ["test", "--", "--run", "src/new-map/MapRoot.selection.test.ts", "src/new-map/createMap.test.ts"]
      },
      { id: "playwright_list", command: "npx", args: ["playwright", "test", "--list"], cwd: path.join(repoRoot, "apps", "web") },
      { id: "build", command: "npm", args: ["run", "web:build"] },
      { id: "diff_check", command: "git", args: ["diff", "--check"] }
    ];
    for (const gate of gateCommands) {
      const result = await runCommand(gate);
      gates.push(result);
      if (result.status !== "PASS") break;
    }
  }

  let localReplay = {
    pass: false,
    summary_path: rel(localReplaySummaryPath),
    browser: localBrowser,
    matrix_count: 0,
    pass_count: 0,
    territory_matrix_pass: false,
    kosovo_popup: false,
    french_guiana_popup: false,
    kosovo_popup_path: "",
    french_guiana_popup_path: "",
    failed_geos: []
  };
  const gatesPass = earlyFailures.length === 0 && gates.length === 7 && gates.every((gate) => gate.status === "PASS");
  if (gatesPass) {
    const replayResult = await runLocalPopupReplay();
    gates.push(replayResult);
    localReplay = localReplayEvidence(await readJson(localReplaySummaryPath));
  }

  const status =
    earlyFailures.length === 0 &&
    gates.length === 8 &&
    gates.every((gate) => gate.status === "PASS") &&
    localReplay.pass &&
    localReplay.kosovo_popup &&
    localReplay.french_guiana_popup &&
    localReplay.territory_matrix_pass
      ? "PASS"
      : "FAIL";
  const payload = {
    generated_at: generatedAt,
    run_id: runId,
    status,
    prod_run_allowed: status === "PASS",
    hypothesis,
    attempt_budget: attemptBudget,
    local_target: localTarget,
    local_ui: localUiStartup,
    local_probe: localProbe,
    gates: [...earlyFailures, ...gates],
    local_replay: localReplay
  };
  await writeJson(path.join(reportDir, "prod-attempt-readiness.json"), payload);
  await writeJson(latestReadinessPath, payload);
  console.log(`PROD_READINESS=${status}`);
  console.log(`PROD_RUN_ALLOWED=${status === "PASS" ? "YES" : "NO"}`);
  console.log(`ATTEMPT_BUDGET=${attemptBudget}`);
  console.log(`HYPOTHESIS=${hypothesis || "MISSING"}`);
  console.log(`LOCAL_UI_READY=${localUiStartup.LOCAL_UI_READY}`);
  if (localUiStartup.LOCAL_UI_START_FAILED) console.log(`LOCAL_UI_START_FAILED=${localUiStartup.LOCAL_UI_START_FAILED}`);
  console.log(`LOCAL_REPLAY_PASS=${localReplay.pass ? "YES" : "NO"}`);
  console.log(`READINESS_ARTIFACT=${rel(latestReadinessPath)}`);
  if (status !== "PASS") process.exitCode = 1;
}

await main().catch(async (error) => {
  await ensureDir(reportDir);
  await fs.writeFile(path.join(reportDir, "error.txt"), `${error.stack || error.message || error}\n`, "utf8");
  console.error(error.message || error);
  process.exit(1);
});
