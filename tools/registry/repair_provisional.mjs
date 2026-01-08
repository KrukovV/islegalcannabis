import fs from "node:fs";
import path from "node:path";

function listJsonFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsonFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  const lawsDir = path.join(process.cwd(), "data", "laws");
  const files = listJsonFiles(lawsDir);
  const today = new Date().toISOString().slice(0, 10);
  let schemaVersion = null;
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.schema_version) {
      schemaVersion = parsed.schema_version;
      break;
    }
  }

  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || parsed.status !== "provisional") continue;
    let changed = false;
    const next = { ...parsed };
    if (!next.verified_at) {
      next.verified_at = next.updated_at || today;
      changed = true;
    }
    if (next.id && String(next.id).length === 2 && next.country) {
      next.id = String(next.country).toUpperCase();
      changed = true;
    }
    if (!next.provenance || Array.isArray(next.provenance) || typeof next.provenance === "string") {
      next.provenance = {
        method: "ocr+ai",
        extracted_at: today,
        model_id: "registry",
        input_hashes: []
      };
      changed = true;
    } else if (typeof next.provenance === "object") {
      if (next.provenance.method !== "ocr+ai") {
        next.provenance.method = "ocr+ai";
        changed = true;
      }
      if (!next.provenance.extracted_at) {
        next.provenance.extracted_at = today;
        changed = true;
      }
      if (!next.provenance.model_id) {
        next.provenance.model_id = "registry";
        changed = true;
      }
      if (!Array.isArray(next.provenance.input_hashes)) {
        next.provenance.input_hashes = [];
        changed = true;
      }
      changed = true;
    }
    if (schemaVersion && next.schema_version !== schemaVersion) {
      next.schema_version = schemaVersion;
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    }
  }
}

main();
