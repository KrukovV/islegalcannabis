import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const file = path.join(process.cwd(), "Reports", "checked", "last_checked.json");
let line = "Checked saved: Reports/checked/last_checked.json";
if (!fs.existsSync(file)) {
  fail("checked artifact missing");
}
let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  fail("checked artifact invalid JSON");
}
if (!Array.isArray(data)) {
  fail("checked artifact invalid");
}
const preview = data
  .slice(0, 5)
  .map((entry) => {
    const flag = entry.flag ?? "";
    const id = entry.id ?? "";
    const name = entry.name ?? "";
    return [flag, id, name].filter(Boolean).join(" ").trim();
  })
  .join(", ");
const suffix = preview ? ` (e.g., ${preview})` : "";
line += suffix;
process.stdout.write(line.length > 140 ? `${line.slice(0, 137)}...` : line);
