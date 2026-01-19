import fs from "node:fs";

export function formatCheckedLine(trace, maxLength = 140) {
  if (!trace || !Array.isArray(trace.checks)) {
    return "Checked: 0";
  }
  const ids = [];
  for (const item of trace.checks) {
    const id = typeof item?.id === "string" ? item.id : null;
    if (!id || ids.includes(id)) continue;
    const flag = typeof item?.flag === "string" ? item.flag : "";
    const label = flag ? `${flag} ${id}` : id;
    ids.push(label);
    if (ids.length >= 5) break;
  }
  const total = Number(trace.total ?? trace.checks.length ?? 0);
  const sample = ids.length ? ` (${ids.join(", ")})` : "";
  let line = `Checked: ${total}${sample}`;
  if (line.length > maxLength) {
    line = line.slice(0, maxLength - 3).trimEnd() + "...";
  }
  return line;
}

if (process.argv.includes("--file")) {
  const idx = process.argv.indexOf("--file");
  const file = process.argv[idx + 1];
  if (file && fs.existsSync(file)) {
    const trace = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(formatCheckedLine(trace));
  } else {
    console.log("Checked: 0");
  }
}
