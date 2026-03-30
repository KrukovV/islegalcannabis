import { execFileSync } from "node:child_process";

const args = [
  "-w",
  "apps/web",
  "run",
  "test",
  "--",
  "src/lib/wikiTruthAudit.test.ts",
  "-t",
  "keeps wikipedia and books.google out of official sources"
];

try {
  const output = execFileSync("npm", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  process.stdout.write(output);
  console.log("OFFICIAL_LINKS_PURITY_GUARD=PASS");
} catch (error) {
  if (error.stdout) process.stdout.write(String(error.stdout));
  if (error.stderr) process.stderr.write(String(error.stderr));
  console.log("OFFICIAL_LINKS_PURITY_GUARD=FAIL");
  process.exit(1);
}
