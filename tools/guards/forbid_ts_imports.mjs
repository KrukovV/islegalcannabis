import { spawnSync } from "node:child_process";

function hasCmd(cmd) {
  const result = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

const importPattern = "(from|import)\\s+[^\"']*[\"'][^\"']+\\.ts[\"']";

if (hasCmd("rg")) {
  const result = spawnSync(
    "rg",
    ["-n", "--glob", "packages/shared/src/**/*.ts", importPattern, "packages/shared/src"],
    { encoding: "utf8" }
  );
  if (result.stdout && result.stdout.trim()) {
    process.stdout.write(result.stdout);
    console.error("ERROR: .ts import extensions are not allowed in packages/shared/src.");
    process.exit(1);
  }
  const tsconfigResult = spawnSync(
    "rg",
    ["-n", "allowImportingTsExtensions", "apps/web/tsconfig.json"],
    { encoding: "utf8" }
  );
  if (tsconfigResult.stdout && tsconfigResult.stdout.trim()) {
    process.stdout.write(tsconfigResult.stdout);
    console.error("ERROR: allowImportingTsExtensions is not allowed in apps/web/tsconfig.json.");
    process.exit(1);
  }
} else {
  const result = spawnSync(
    "grep",
    ["-R", "-n", "-E", importPattern, "packages/shared/src"],
    { encoding: "utf8" }
  );
  if (result.stdout && result.stdout.trim()) {
    process.stdout.write(result.stdout);
    console.error("ERROR: .ts import extensions are not allowed in packages/shared/src.");
    process.exit(1);
  }
  const tsconfigResult = spawnSync(
    "grep",
    ["-n", "allowImportingTsExtensions", "apps/web/tsconfig.json"],
    { encoding: "utf8" }
  );
  if (tsconfigResult.stdout && tsconfigResult.stdout.trim()) {
    process.stdout.write(tsconfigResult.stdout);
    console.error("ERROR: allowImportingTsExtensions is not allowed in apps/web/tsconfig.json.");
    process.exit(1);
  }
}
