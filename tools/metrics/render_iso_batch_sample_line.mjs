import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "Reports", "iso-last-batch.json");
if (!fs.existsSync(file)) {
  process.exit(0);
}
let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  process.exit(0);
}
const added = Array.isArray(data.added) ? data.added.filter(Boolean) : [];
const sample = added.slice(0, 5).join(", ");
if (!sample) {
  process.exit(0);
}
let line = `ISO batch: +${added.length} provisional (${sample})`;
if (line.length > 140) {
  line = `${line.slice(0, 137)}...`;
}
process.stdout.write(line);
