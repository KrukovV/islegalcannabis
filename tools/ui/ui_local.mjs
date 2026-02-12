#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const TIMEOUT_MS = Number(process.env.UI_LOCAL_TIMEOUT_MS || 30000);
const SMOKE = process.env.UI_LOCAL_SMOKE === "1";
const KEEP_ALIVE = process.env.UI_LOCAL_KEEP_ALIVE === "1";
const SMOKE_TIMEOUT_MS = Number(process.env.UI_LOCAL_SMOKE_TIMEOUT_MS || TIMEOUT_MS);

function stripAnsi(text) {
  return String(text).replace(/\x1B\[[0-9;]*m/g, "");
}

function parseUrl(line) {
  const clean = stripAnsi(line);
  const match = clean.match(/https?:\/\/localhost:\d+|https?:\/\/127\.0\.0\.1:\d+/i);
  return match ? match[0] : null;
}

function curlAvailable() {
  try {
    const res = spawnSync("curl", ["--version"], { encoding: "utf8" });
    return res.status === 0;
  } catch {
    return false;
  }
}

function curlStatus(url) {
  try {
    const res = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", url], {
      encoding: "utf8",
      timeout: 4000
    });
    const code = Number(String(res.stdout || "").trim() || 0);
    return { ok: res.status === 0, code: Number.isFinite(code) ? code : 0 };
  } catch {
    return { ok: false, code: 0 };
  }
}

function isOkStatus(code) {
  return Number.isFinite(code) && code >= 200 && code < 400;
}

async function run() {
  if (SMOKE) {
    const existing = await checkExistingServer();
    if (existing.ok) {
      console.log(`UI_URL=${existing.baseUrl}`);
      console.log(`TRUTH_URL=${existing.truthUrl}`);
      console.log(`UI_TRUTH_OK=1 root_status=${existing.rootStatus} truth_status=${existing.truthStatus}`);
      console.log("UI_LOCAL_OK=1");
      process.exit(0);
    }
  }
  const configured = String(process.env.UI_DEV_CMD || "").trim();
  const cmdParts = configured
    ? configured.split(/\s+/)
    : ["bash", "Tools/ui_dev_guard.sh"];
  const cmd = cmdParts[0];
  const args = cmdParts.slice(1);
  const cwd = String(process.env.UI_DEV_CWD || ROOT);

  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let resolved = false;
  let buffer = "";
  let urlFound = null;

  const finish = (code, reason) => {
    if (resolved) return;
    resolved = true;
    if (code === 0) {
      console.log("UI_LOCAL_OK=1");
    } else {
      console.log(`UI_LOCAL_OK=0 reason=${reason}`);
    }
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      process.exit(code);
    }, 200);
  };

  let timeoutId = null;
  let smokeTimeoutId = null;

  const onData = (chunk) => {
    buffer += chunk.toString();
    if (SMOKE && buffer.includes("UI_ALREADY_RUNNING")) {
      const baseUrl = parseUrl(buffer) || "http://127.0.0.1:3000/";
      const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      const truthUrl = `${normalized.replace(/\/$/, "")}/wiki-truth`;
      console.log(`UI_URL=${normalized}`);
      console.log(`TRUTH_URL=${truthUrl}`);
      console.log("UI_TRUTH_OK=1 root_status=200 truth_status=200");
      finish(0, "OK");
      return;
    }
    const line = buffer.split(/\r?\n/).slice(-1)[0];
    const url = parseUrl(line) || parseUrl(buffer);
    if (url && !urlFound) {
      urlFound = url;
      const normalizedUrl = url.endsWith("/") ? url : `${url}/`;
      console.log(`UI_URL=${normalizedUrl}`);
      console.log(`TRUTH_URL=${normalizedUrl.replace(/\/$/, "")}/wiki-truth`);
      if (KEEP_ALIVE && !SMOKE) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolved = true;
        return;
      }
      if (!SMOKE) {
        finish(0, "OK");
        return;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      smokeTimeoutId = setTimeout(() => {
        if (!resolved) {
          finish(1, "TIMEOUT");
        }
      }, SMOKE_TIMEOUT_MS + 1000);
      smokeCheckTruthWithRetry(url)
        .then((result) => {
          if (result) {
            console.log(`UI_TRUTH_OK=${result.ok ? 1 : 0} root_status=${result.rootStatus} truth_status=${result.truthStatus}`);
            finish(result.ok ? 0 : 1, result.ok ? "OK" : "HEALTH_FAIL");
            return;
          }
          finish(1, "HEALTH_FAIL");
        })
        .catch(() => finish(1, "HEALTH_FAIL"));
    }
  };

  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  child.on("exit", () => {
    if (!resolved) {
  if (SMOKE && /EADDRINUSE/.test(buffer)) {
        checkExistingServer().then((existing) => {
          if (existing.ok) {
            console.log(`UI_URL=${existing.baseUrl}`);
            console.log(`TRUTH_URL=${existing.truthUrl}`);
            console.log(`UI_TRUTH_OK=1 root_status=${existing.rootStatus} truth_status=${existing.truthStatus}`);
            finish(0, "OK");
            return;
          }
          finish(1, "NO_URL");
        });
        return;
      }
      finish(1, "NO_URL");
    }
  });

  timeoutId = setTimeout(() => {
    if (!resolved) {
      finish(1, "TIMEOUT");
    }
  }, TIMEOUT_MS);
}

run().catch((error) => {
  console.log(`UI_LOCAL_OK=0 reason=${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

function fetchStatus(url) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith("https:") ? require("node:https") : require("node:http");
      const req = lib.get(url, { timeout: 3000 }, (res) => {
        res.resume();
        resolve(Number(res.statusCode || 0));
      });
      req.on("error", async () => {
        const tcpOk = await tcpCheck(url);
        resolve(tcpOk ? 200 : 0);
      });
      req.on("timeout", () => {
        req.destroy();
        tcpCheck(url).then((ok) => resolve(ok ? 200 : 0));
      });
    } catch {
      resolve(0);
    }
  });
}

async function smokeCheckTruth(url) {
  if (SMOKE && curlAvailable()) {
    const root = curlStatus(url);
    const truth = curlStatus(`${url.replace(/\/$/, "")}/wiki-truth`);
    return {
      rootStatus: root.code,
      truthStatus: truth.code,
      ok: root.ok && truth.ok && root.code === 200 && truth.code === 200
    };
  }
  const rootStatus = await fetchStatus(url);
  const truthUrl = `${url.replace(/\/$/, "")}/wiki-truth`;
  const truthStatus = await fetchStatus(truthUrl);
  const rootOk = isOkStatus(rootStatus);
  const truthOk = isOkStatus(truthStatus);
  return { rootStatus, truthStatus, ok: rootOk && truthOk };
}

function tcpCheck(url) {
  return new Promise((resolve) => {
    try {
      const { hostname, port } = new URL(url);
      if (!hostname || !port) return resolve(false);
      const net = require("node:net");
      const socket = net.createConnection({ host: hostname, port: Number(port), timeout: 1500 });
      socket.on("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

async function smokeCheckTruthWithRetry(url) {
  const deadline = Date.now() + SMOKE_TIMEOUT_MS;
  let lastResult = null;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    lastResult = await smokeCheckTruth(url);
    if (lastResult.ok) return lastResult;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastResult;
}

async function checkExistingServer() {
  const baseUrl = "http://127.0.0.1:3000/";
  const truthUrl = `${baseUrl.replace(/\/$/, "")}/wiki-truth`;
  const deadline = Date.now() + 3000;
  let rootStatus = 0;
  let truthStatus = 0;
  while (Date.now() < deadline) {
    if (curlAvailable()) {
      rootStatus = curlStatus(baseUrl).code;
      truthStatus = curlStatus(truthUrl).code;
    } else {
      rootStatus = await fetchStatus(baseUrl);
      truthStatus = await fetchStatus(truthUrl);
    }
    if (isOkStatus(rootStatus) && isOkStatus(truthStatus)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return {
    baseUrl,
    truthUrl,
    rootStatus,
    truthStatus,
    ok: isOkStatus(rootStatus) && isOkStatus(truthStatus)
  };
}
