import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { spawn, execFileSync } from "node:child_process";
import { test } from "node:test";

const helper = fileURLToPath(new URL("./with_ci_lease.pl", import.meta.url));
function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-ci-lease-test-"));
  const root = path.join(temp, "root");
  const other = path.join(temp, "other");
  fs.mkdirSync(root);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init", "-q");
  git("-c", "user.name=CI fixture", "-c", "user.email=ci@example.invalid", "commit", "--allow-empty", "-qm", "fixture");
  git("worktree", "add", "--detach", "-q", other);
  return { root, other, temp, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
}
function child(command, args, cwd) {
  const process = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  process.stdout.on("data", (data) => { output += data; });
  process.stderr.on("data", (data) => { output += data; });
  const result = new Promise((resolve, reject) => {
    process.on("error", reject);
    process.on("close", (code, signal) => resolve({ code, signal, output }));
  });
  return { process, result };
}
const run = (root, source) => child("perl", [helper, root, process.execPath, "--input-type=module", "-e", source], root);

test("repository worktrees share an OS lease and cannot overlap child work", async () => {
  const f = fixture();
  try {
    const log = path.join(f.temp, "events.jsonl");
    const source = (id) => `import fs from 'node:fs'; const log=${JSON.stringify(log)}; fs.appendFileSync(log,JSON.stringify({id:${id},event:'start'})+'\\n'); await new Promise(r=>setTimeout(r,200)); fs.appendFileSync(log,JSON.stringify({id:${id},event:'end'})+'\\n');`;
    const results = await Promise.all([run(f.root, source(1)).result, run(f.other, source(2)).result]);
    assert.ok(results.every((r) => r.code === 0), JSON.stringify(results));
    const events = fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(events.map((r) => r.event), ["start", "end", "start", "end"]);
    assert.equal(events[0].id, events[1].id);
    assert.equal(events[2].id, events[3].id);
    assert.notEqual(events[0].id, events[2].id);
  } finally { f.cleanup(); }
});

test("failed child status is retained and the OS lease is released", async () => {
  const f = fixture();
  try {
    assert.equal((await run(f.root, "process.exit(17)").result).code, 17);
    const next = await run(f.other, "process.stdout.write('CHILD_RAN')").result;
    assert.equal(next.code, 0);
    assert.match(next.output, /CHILD_RAN/);
  } finally { f.cleanup(); }
});

test("a live legacy cycle is awaited and its PID file is preserved", async () => {
  const f = fixture();
  try {
    const tools = path.join(f.other, "tools");
    fs.mkdirSync(tools);
    const script = path.join(tools, "pass_cycle.sh");
    const release = path.join(f.temp, "release-legacy");
    fs.writeFileSync(script, 'while [ ! -f "$1" ]; do sleep 0.05; done\n');
    const legacy = child("bash", [script, release], f.other);
    const lock = path.join(f.other, ".checkpoints", "pass_cycle.lock");
    fs.mkdirSync(lock, { recursive: true });
    const owner = `${legacy.process.pid}\n`;
    fs.writeFileSync(path.join(lock, "owner.pid"), owner);
    const guarded = run(f.root, `import fs from 'node:fs'; if(!fs.existsSync(${JSON.stringify(release)})) process.exit(21); process.stdout.write('CHILD_RAN')`);
    guarded.process.stdout.on("data", (data) => {
      if (String(data).includes("CI_SHARED_LEASE_WAIT legacy_pid=")) fs.writeFileSync(release, "release owned fixture\n");
    });
    const result = await guarded.result;
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /CI_SHARED_LEASE_WAIT legacy_pid=/);
    assert.equal(fs.readFileSync(path.join(lock, "owner.pid"), "utf8"), owner);
    assert.equal((await legacy.result).code, 0);
  } finally { f.cleanup(); }
});
