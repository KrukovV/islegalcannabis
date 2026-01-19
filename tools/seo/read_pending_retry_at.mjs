import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "Reports", "trends", "meta.json");
if (!fs.existsSync(file)) {
  process.stdout.write("n/a");
  process.exit(0);
}
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const retryAt = data?.retryAt;
  if (!retryAt) {
    process.stderr.write("invalid pending json");
    process.exit(2);
  }
  process.stdout.write(retryAt);
} catch {
  process.stderr.write("invalid pending json");
  process.exit(2);
}
