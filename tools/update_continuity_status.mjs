import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const continuityPath = path.join(root, "CONTINUITY.md");
const ciFinalPath = path.join(root, "Reports", "ci-final.txt");

if (!fs.existsSync(continuityPath) || !fs.existsSync(ciFinalPath)) {
  process.exit(0);
}

const ciFinal = fs.readFileSync(ciFinalPath, "utf8");
const continuity = fs.readFileSync(continuityPath, "utf8");

const ciStatus = ciFinal.match(/^CI_STATUS=([A-Z_]+)/m)?.[1];
const smokeStatus = ciFinal.match(/^SMOKE_STATUS=([A-Z_]+)/m)?.[1];

if (!ciStatus && !smokeStatus) {
  process.exit(0);
}

const next = continuity.replace(
  /^State:\s*(.*)$/m,
  (_line, stateValue) => {
    let nextState = String(stateValue);
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
  fs.writeFileSync(continuityPath, next);
}
