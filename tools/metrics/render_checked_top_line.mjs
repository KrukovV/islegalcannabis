import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const file = path.join(process.cwd(), "Reports", "checked", "last_checked.json");
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
const previewItems = data.slice(0, 10).map((entry) => {
  const flag = entry.flag ?? "";
  const id = entry.id ?? "";
  const name = entry.name ?? "";
  if (!name || String(name).trim().length < 2) {
    fail("checked artifact missing names");
  }
  return [flag, id, name].filter(Boolean).join(" ").trim();
});
const remaining = Math.max(0, data.length - 10);
const suffix = remaining ? ` (+${remaining})` : "";
let line = `Checked top10: ${previewItems.join(", ")}${suffix}`;
if (line.length > 140) {
  line = `${line.slice(0, 137)}...`;
}
process.stdout.write(line);
