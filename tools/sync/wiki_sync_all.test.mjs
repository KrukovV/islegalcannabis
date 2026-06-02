import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("readonly CI wiki sync emits an explicit WIKI_SYNC_ALL skip line", () => {
  const result = spawnSync("bash", ["tools/sync/wiki_sync_all.sh"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      READONLY_CI: "1",
      UPDATE_MODE: "0"
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^SYNC DISABLED IN CI \(UPDATE_MODE=0\)$/m);
  assert.match(result.stdout, /^SKIP_WRITE_UPDATE_MODE=1$/m);
  assert.match(
    result.stdout,
    /^WIKI_SYNC_ALL total_countries=0 states=0 total=0 revision=- changed=0 duration_ms=0 mode=SKIPPED rc=0 reason=UPDATE_MODE_0$/m
  );
});
