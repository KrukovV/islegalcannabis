import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(process.env.ISLEGAL_REPO_ROOT ?? process.cwd());
const appPackagePath = path.join(root, "apps", "web", "package.json");
const appRequire = createRequire(appPackagePath);
const testModule = appRequire("@playwright/test");
const testModulePath = appRequire.resolve("@playwright/test");
const version = appRequire("@playwright/test/package.json").version;
const expectedVersion = "1.61.1";

if (version !== expectedVersion || !testModulePath.includes(`${path.sep}apps${path.sep}web${path.sep}node_modules${path.sep}`)) {
  throw new Error(
    `PLAYWRIGHT_RUNTIME_MISMATCH expected=${expectedVersion} actual=${version} module=${testModulePath}`
  );
}

function browserRevision(browserName, executablePath) {
  const match = executablePath.match(new RegExp(`${browserName}-(\\d+)`));
  if (!match) throw new Error(`PLAYWRIGHT_BROWSER_REVISION_UNRESOLVED browser=${browserName} path=${executablePath}`);
  return match[1];
}

export const { chromium, firefox, webkit, devices, defineConfig } = testModule;
export const playwright = Object.freeze({ chromium, firefox, webkit });
export const playwrightRuntime = Object.freeze({
  source: "apps/web",
  version,
  testModulePath,
  chromiumRevision: browserRevision("chromium", chromium.executablePath()),
  webkitRevision: browserRevision("webkit", webkit.executablePath())
});
