import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const continuityPath = path.join(root, "CONTINUITY.md");
const ciFinalPath = path.join(root, "Reports", "ci-final.txt");
const checkpointArgIndex = process.argv.indexOf("--checkpoint");
const checkpoint = checkpointArgIndex >= 0
  ? String(process.argv[checkpointArgIndex + 1] || "").trim()
  : "";

if (!fs.existsSync(continuityPath)) {
  process.exit(0);
}

const ciFinal = fs.existsSync(ciFinalPath) ? fs.readFileSync(ciFinalPath, "utf8") : "";
const continuity = fs.readFileSync(continuityPath, "utf8");

const ciStatus = ciFinal.match(/^CI_STATUS=([A-Z_]+)/m)?.[1];
const smokeStatus = ciFinal.match(/^SMOKE_STATUS=([A-Z_]+)/m)?.[1];

if (!checkpoint && !ciStatus && !smokeStatus) {
  process.exit(0);
}

const next = continuity.replace(
  /^State:\s*(.*)$/m,
  (_line, stateValue) => {
    let nextState = String(stateValue);
    if (checkpoint) {
      nextState = /(?:^|;)\s*checkpoint=[^;\s]+/.test(nextState)
        ? nextState.replace(/checkpoint=[^;\s]+/, checkpoint)
        : `${nextState}; ${checkpoint}`;
    }
    if (ciStatus) {
      nextState = nextState.replace(/CI=[^;]+/, `CI=${ciStatus}`);
    }
    if (smokeStatus) {
      nextState = nextState.replace(/Smoke=[^;]+/, `Smoke=${smokeStatus}`);
    }
    return `State: ${nextState}`;
  }
);

if (next !== continuity) {
  if (fs.readFileSync(continuityPath, "utf8") !== continuity) {
    console.error("CONTINUITY.md changed during status update; refusing to overwrite it.");
    process.exit(2);
  }
  const tempPath = `${continuityPath}.tmp`;
  fs.writeFileSync(tempPath, next);
  fs.renameSync(tempPath, continuityPath);
}
