import { runWikiTruthProbe } from "../../tools/playwright-smoke/live_probe_lib.mjs";

await runWikiTruthProbe({
  browserName: globalThis.process?.env?.BROWSER || "chromium",
  headless: true
});
