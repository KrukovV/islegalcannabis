import { spawnSync } from "node:child_process";

const base = spawnSync("bash", ["tools/guard-ssr.sh"], { stdio: "inherit" });
if (base.status !== 0) {
  process.exit(base.status ?? 1);
}

const forced = spawnSync("bash", ["tools/guard-ssr.sh"], {
  stdio: "inherit",
  env: { ...process.env, ILC_FORCE_GREP: "1" }
});
if (forced.status !== 0) {
  process.exit(forced.status ?? 1);
}
