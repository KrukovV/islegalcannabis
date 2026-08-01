#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "@playwright/test";
import { acquireProjectProcessSlot } from "../runtime/processSlots.mjs";

const ROOT = process.cwd();
const BASE_URL = "http://127.0.0.1:3000";
const browserName = process.env.BROWSER || "webkit";
const headless = !["0", "false", "no"].includes(
  String(process.env.HEADLESS ?? "1").toLowerCase(),
);
const PROJECT_NULL_GEOS = ["BJN", "BRT", "SCR", "SER", "KAS", "SPI", "PGA"];
const EXPECTED_PROJECT_NULL_OFFICIAL_COLORS = {
  LEGAL_OR_DECRIM: true,
  LIMITED_OR_MEDICAL: true,
  ILLEGAL: true,
  UNKNOWN: true,
};
const screenshotBeforePath =
  process.env.SCREENSHOT_BEFORE_PATH ||
  path.join(ROOT, "Artifacts", `${browserName}-wiki-truth-before.jpg`);
const screenshotAfterPath =
  process.env.SCREENSHOT_AFTER_PATH ||
  path.join(ROOT, "Artifacts", `${browserName}-wiki-truth-after.jpg`);
const jsonPath =
  process.env.JSON_PATH ||
  path.join(ROOT, "Artifacts", `${browserName}-wiki-truth.json`);
const projectNullColorScreenshotPath =
  process.env.PROJECT_NULL_COLOR_SCREENSHOT_PATH || "";
const projectNullMatrixScreenshotPath =
  process.env.PROJECT_NULL_MATRIX_SCREENSHOT_PATH || "";
const colorProposalsPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-color-proposals.json",
);
const colorProposalsArtifact = JSON.parse(
  await fs.readFile(colorProposalsPath, "utf8"),
);
const colorApplyPlanPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-color-apply-plan.json",
);
const colorApplyPlanArtifact = JSON.parse(
  await fs.readFile(colorApplyPlanPath, "utf8"),
);
const colorApplyGatePath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-color-apply-gate.json",
);
const colorApplyGateArtifact = JSON.parse(
  await fs.readFile(colorApplyGatePath, "utf8"),
);
const colorReviewDossierPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-color-review-dossier.json",
);
const colorReviewDossierArtifact = JSON.parse(
  await fs.readFile(colorReviewDossierPath, "utf8"),
);
const runtimeApplyDryRunDiffPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-runtime-apply-dry-run-diff.json",
);
const runtimeApplyDryRunDiffArtifact = JSON.parse(
  await fs.readFile(runtimeApplyDryRunDiffPath, "utf8"),
);
const runtimeApplyPreflightPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-runtime-apply-preflight.json",
);
const runtimeApplyPreflightArtifact = JSON.parse(
  await fs.readFile(runtimeApplyPreflightPath, "utf8"),
);
const runtimeApplyExecutionPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-runtime-apply-execution.json",
);
const runtimeApplyExecutionArtifact = JSON.parse(
  await fs.readFile(runtimeApplyExecutionPath, "utf8"),
);
const runtimePostApplyVerificationPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-runtime-post-apply-verification.json",
);
const runtimePostApplyVerificationArtifact = JSON.parse(
  await fs.readFile(runtimePostApplyVerificationPath, "utf8"),
);
const legalKnowledgeAxisMatrixPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-legal-knowledge-axis-matrix.json",
);
const legalKnowledgeAxisMatrixArtifact = JSON.parse(
  await fs.readFile(legalKnowledgeAxisMatrixPath, "utf8"),
);
const blockerExitDossierPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-blocker-exit-dossier.json",
);
const blockerExitDossierArtifact = JSON.parse(
  await fs.readFile(blockerExitDossierPath, "utf8"),
);
const finalReconciliationPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-final-reconciliation.json",
);
const finalReconciliationArtifact = JSON.parse(
  await fs.readFile(finalReconciliationPath, "utf8"),
);
const acceptanceAuditPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-acceptance-audit.json",
);
const acceptanceAuditArtifact = JSON.parse(
  await fs.readFile(acceptanceAuditPath, "utf8"),
);
const primaryLawBlockersPath = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-307-primary-law-blockers.json",
);
const primaryLawBlockersArtifact = JSON.parse(
  await fs.readFile(primaryLawBlockersPath, "utf8"),
);
const expectedColorProposals = Array.isArray(colorProposalsArtifact.proposals)
  ? colorProposalsArtifact.proposals
  : [];
const expectedColorProposalTotal = Number(
  colorProposalsArtifact.proposalsTotal ?? expectedColorProposals.length,
);
const expectedColorProposalActionCounts = expectedColorProposals.reduce(
  (counts, proposal) => {
    const action = String(proposal.proposalAction || "UNKNOWN_ACTION");
    counts[action] = (counts[action] || 0) + 1;
    return counts;
  },
  {},
);
const expectedColorProposalGeos = expectedColorProposals
  .map((proposal) => String(proposal.geo || ""))
  .filter(Boolean)
  .sort();
const expectedRemoveColorPendingProofGeos = expectedColorProposals
  .filter(
    (proposal) =>
      proposal.proposalAction ===
      "REMOVE_COLOR_PENDING_APPLICABLE_LAW_PROOF",
  )
  .map((proposal) => String(proposal.geo || ""))
  .filter(Boolean)
  .sort();
const expectedColorApplyPlanRows = Array.isArray(colorApplyPlanArtifact.rows)
  ? colorApplyPlanArtifact.rows
  : [];
const expectedColorApplyPlanTotal = Number(
  colorApplyPlanArtifact.rowsTotal ?? expectedColorApplyPlanRows.length,
);
const expectedColorApplyPlanGeos = expectedColorApplyPlanRows
  .map((row) => String(row.geo || ""))
  .filter(Boolean)
  .sort();
const expectedColorApplyPlanDispositionCounts =
  expectedColorApplyPlanRows.reduce((counts, row) => {
    const disposition = String(row.applyDisposition || "UNKNOWN");
    counts[disposition] = (counts[disposition] || 0) + 1;
    return counts;
  }, {});
const expectedColorApplyPlanBlockedPrimaryLawGeos =
  expectedColorApplyPlanRows
    .filter((row) => row.blockedByPrimaryLaw === true)
    .map((row) => String(row.geo || ""))
    .filter(Boolean)
    .sort();
const expectedColorApplyGateRows = Array.isArray(colorApplyGateArtifact.rows)
  ? colorApplyGateArtifact.rows
  : [];
const expectedColorApplyGateTotal = expectedColorApplyGateRows.length;
const expectedColorApplyGateGeos = expectedColorApplyGateRows
  .map((row) => String(row.geo || ""))
  .filter(Boolean)
  .sort();
const expectedColorApplyGatePrimaryLawBlockers = (
  Array.isArray(colorApplyGateArtifact.primaryLawBlockers?.geos)
    ? colorApplyGateArtifact.primaryLawBlockers.geos
    : []
)
  .map((geo) => String(geo || ""))
  .filter(Boolean)
  .sort()
  .join(",");
const expectedAcceptanceRows = Array.isArray(acceptanceAuditArtifact.rows)
  ? acceptanceAuditArtifact.rows
  : [];
const expectedAcceptanceRowsTotal = Number(
  acceptanceAuditArtifact.rowsTotal ?? expectedAcceptanceRows.length,
);
const expectedAcceptanceRowsExpected = Number(
  acceptanceAuditArtifact.rowsExpected ?? 307,
);
const expectedAcceptanceGeos = expectedAcceptanceRows
  .map((row) => String(row.geo || ""))
  .filter(Boolean)
  .sort();
const expectedAcceptancePartialGeos = expectedAcceptanceRows
  .filter((row) => String(row.status || "") !== "PROVEN")
  .map((row) => String(row.geo || ""))
  .filter(Boolean)
  .sort();
const expectedAcceptanceRequirementStatuses = Object.fromEntries(
  Object.entries(acceptanceAuditArtifact.globalRequirements || {}).map(
    ([key, requirement]) => [
      key,
      String(requirement?.status || "UNKNOWN"),
    ],
  ),
);
const expectedColorApplyGateDecisionCounts =
  expectedColorApplyGateRows.reduce((counts, row) => {
    const decision = String(row.gateDecision || "UNKNOWN");
    counts[decision] = (counts[decision] || 0) + 1;
    return counts;
  }, {});
const expectedColorReviewDossierRows = Array.isArray(
  colorReviewDossierArtifact.rows,
)
  ? colorReviewDossierArtifact.rows
  : [];
const expectedColorReviewDossierTotal = Number(
  colorReviewDossierArtifact.rowsTotal ?? expectedColorReviewDossierRows.length,
);
const expectedColorReviewDossierGeos = expectedColorReviewDossierRows
  .map((row) => String(row.geo || ""))
  .filter(Boolean)
  .sort();
const expectedColorReviewDossierDecisionCounts =
  expectedColorReviewDossierRows.reduce((counts, row) => {
    const decision = String(row.reviewDecision || "UNKNOWN");
    counts[decision] = (counts[decision] || 0) + 1;
    return counts;
  }, {});
const expectedColorReviewDossierLegalBasisCounts =
  expectedColorReviewDossierRows.reduce((counts, row) => {
    const legalBasis = String(row.legalBasisClass || "UNKNOWN");
    counts[legalBasis] = (counts[legalBasis] || 0) + 1;
    return counts;
  }, {});
const expectedColorReviewDossierPrimaryLawBlockers = (
  Array.isArray(colorReviewDossierArtifact.primaryLawBlockers?.geos)
    ? colorReviewDossierArtifact.primaryLawBlockers.geos
    : []
)
  .map((geo) => String(geo || ""))
  .filter(Boolean)
  .sort()
  .join(",");
const expectedRuntimeApplyExecutionRows = Array.isArray(
  runtimeApplyExecutionArtifact.rows,
)
  ? runtimeApplyExecutionArtifact.rows
  : [];
const expectedRuntimeApplyExecutionTotal = Number(
  runtimeApplyExecutionArtifact.rowsTotal ?? expectedRuntimeApplyExecutionRows.length,
);
const expectedRuntimeApplyExecutionGeos = expectedRuntimeApplyExecutionRows
  .map((row) => String(row.geo || ""))
  .filter(Boolean)
  .sort();
const expectedRuntimeApplyExecutionDecisionCounts =
  expectedRuntimeApplyExecutionRows.reduce((counts, row) => {
    const decision = String(row.executionDecision || "UNKNOWN");
    counts[decision] = (counts[decision] || 0) + 1;
    return counts;
  }, {});
const expectedRuntimeApplyExecutionBlockingReasonCounts =
  expectedRuntimeApplyExecutionRows.reduce((counts, row) => {
    const reasons = Array.isArray(row.blockingReasons)
      ? row.blockingReasons
      : [];
    for (const reason of reasons) {
      const key = String(reason || "UNKNOWN");
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, {});
const expectedRuntimePostApplyBlockedRows = Array.isArray(
  runtimePostApplyVerificationArtifact.blockedRows,
)
  ? runtimePostApplyVerificationArtifact.blockedRows
  : [];
const expectedRuntimePostApplyBlockedTotal =
  expectedRuntimePostApplyBlockedRows.length;
const expectedRuntimePostApplyBlockedGeos = expectedRuntimePostApplyBlockedRows
  .map((row) => String(row.geo || ""))
  .filter(Boolean)
  .sort();
const expectedRuntimePostApplyBlockedDecisionCounts =
  expectedRuntimePostApplyBlockedRows.reduce((counts, row) => {
    const decision = String(row.decision || "UNKNOWN");
    counts[decision] = (counts[decision] || 0) + 1;
    return counts;
  }, {});
const expectedBlockerExitRows = Array.isArray(blockerExitDossierArtifact.rows)
  ? blockerExitDossierArtifact.rows
  : [];
const expectedBlockerExitGeos = expectedBlockerExitRows
  .map((row) => String(row.geo || ""))
  .filter(Boolean)
  .sort();
const expectedBlockerExitClassCounts = expectedBlockerExitRows.reduce(
  (counts, row) => {
    const blockerClass = String(row.blockerClass || "UNKNOWN");
    counts[blockerClass] = (counts[blockerClass] || 0) + 1;
    return counts;
  },
  {},
);
const expectedBlockerExitConditionCounts = expectedBlockerExitRows.reduce(
  (counts, row) => {
    const exitCondition = String(row.exitCondition || "UNKNOWN");
    counts[exitCondition] = (counts[exitCondition] || 0) + 1;
    return counts;
  },
  {},
);
const expectedFinalTruthColorCounts =
  finalReconciliationArtifact.counts?.truthColors || {};
const expectedLegalAxisMatrixRows = Array.isArray(legalKnowledgeAxisMatrixArtifact.rows)
  ? legalKnowledgeAxisMatrixArtifact.rows
  : [];
const expectedLegalAxisMatrixGeos = expectedLegalAxisMatrixRows
  .map((row) => String(row.geo || ""))
  .filter(Boolean)
  .sort();
const expectedLegalAxisSchemaRows = Object.entries(
  legalKnowledgeAxisMatrixArtifact.requiredAxisGroups || {},
).flatMap(([group, axes]) =>
  Array.isArray(axes)
    ? axes.map((axis) => ({
        group: String(group),
        axis: String(axis || ""),
      }))
    : [],
);
const expectedLegalAxisSchemaKeys = expectedLegalAxisSchemaRows
  .map((row) => `${row.group}:${row.axis}`)
  .sort();
const expectedLegalAxisTruthColorCounts = expectedLegalAxisMatrixRows.reduce(
  (counts, row) => {
    const truthColor = String(row.truthColor || "UNKNOWN");
    counts[truthColor] = (counts[truthColor] || 0) + 1;
    return counts;
  },
  {},
);
const expectedPrimaryLawBlockers = Array.isArray(
  primaryLawBlockersArtifact.blockers,
)
  ? primaryLawBlockersArtifact.blockers
  : [];
const expectedPrimaryLawBlockersTotal = Number(
  primaryLawBlockersArtifact.blockersTotal ?? expectedPrimaryLawBlockers.length,
);
const expectedPrimaryLawBlockerGeos = expectedPrimaryLawBlockers
  .map((blocker) => String(blocker.geo || ""))
  .filter(Boolean)
  .sort();
const expectedPrimaryLawBlockerStatuses = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => [String(blocker.geo), String(blocker.status || "")]),
);
const expectedPrimaryLawBlockerColors = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => [
      String(blocker.geo),
      String(blocker.proposedTruthColor || ""),
    ]),
);
const expectedPrimaryLawBlockerNegativeSearches = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => [
      String(blocker.geo),
      (Array.isArray(blocker.negativeSearches)
        ? blocker.negativeSearches
        : []
      )
        .map((search) => `${search.term}:${Number(search.found || 0)}`)
        .join(","),
    ]),
);
const expectedPrimaryLawBlockerBoundaries = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => [
      String(blocker.geo),
      String(blocker.knownPrimaryLawBoundary?.status || ""),
    ]),
);
const expectedPrimaryLawBlockerCollectorHasCannabisPages = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => [
      String(blocker.geo),
      blocker.localCollectorAudit?.hasCannabisPages === true ? "1" : "0",
    ]),
);
const expectedPrimaryLawBlockerCollectorFetchedCandidates = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => [
      String(blocker.geo),
      Number(blocker.localCollectorAudit?.fetchedCandidates || 0),
    ]),
);
const expectedPrimaryLawBlockerVisualScreenshots = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => [
      String(blocker.geo),
      Array.isArray(blocker.visualReviewEvidence?.screenshotPaths)
        ? blocker.visualReviewEvidence.screenshotPaths.length
        : 0,
    ]),
);
const expectedPrimaryLawBlockerFreshSearchResults = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => [
      String(blocker.geo),
      String(blocker.freshPrimaryLawSearchAudit?.result || ""),
    ]),
);
const expectedPrimaryLawBlockerFreshSearchQueryCounts = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => [
      String(blocker.geo),
      Array.isArray(blocker.freshPrimaryLawSearchAudit?.queries)
        ? blocker.freshPrimaryLawSearchAudit.queries.length
        : 0,
    ]),
);
const expectedPrimaryLawBlockerFreshSearchSourceCounts = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => [
      String(blocker.geo),
      Array.isArray(
        blocker.freshPrimaryLawSearchAudit?.officialSourcesReviewed,
      )
        ? blocker.freshPrimaryLawSearchAudit.officialSourcesReviewed.length
        : 0,
    ]),
);
const expectedPrimaryLawBlockerFreshSearchDirectFinds = Object.fromEntries(
  expectedPrimaryLawBlockers
    .filter((blocker) => blocker?.geo)
    .map((blocker) => {
      const audit = blocker.freshPrimaryLawSearchAudit || {};
      const directFinds = [
        ...(Array.isArray(audit.queries) ? audit.queries : []),
        ...(Array.isArray(audit.officialSourcesReviewed)
          ? audit.officialSourcesReviewed
          : []),
      ].filter((item) => item.directCannabisPrimaryLawFound === true).length;
      return [String(blocker.geo), directFinds];
    }),
);

async function safeScreenshot(page, screenshotPath) {
  if (browserName === "chromium" && headless) {
    return "skipped:chromium-headless-screenshot-disabled";
  }
  try {
    await page.screenshot({
      path: screenshotPath,
      type: "jpeg",
      quality: 70,
      fullPage: false,
    });
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : String(error || "unknown_screenshot_error");
  }
}

function browserTypeFor(name) {
  return name === "webkit" ? webkit : chromium;
}

function stableJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

async function waitForSelectorWithReload(page, selector, options = {}) {
  const timeout = Number(options.timeout || 30000);
  const state = options.state;
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await page.waitForSelector(selector, {
        timeout: Math.min(3000, Math.max(250, deadline - Date.now())),
        state,
      });
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) break;
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => null);
    }
  }
  throw lastError || new Error(`selector_not_found:${selector}`);
}

async function captureProjectNullRows(page, sectionTestId, outputPath) {
  if (!outputPath) return null;
  const table = page.locator(`[data-testid='${sectionTestId}'] table`).first();
  try {
    await table.locator("tbody tr").evaluateAll((rows, geos) => {
      for (const row of rows) {
        const geo = row.getAttribute("data-geo") || "";
        if (!geos.includes(geo)) {
          row.setAttribute("data-visual-probe-hidden", "1");
          row.setAttribute("style", `${row.getAttribute("style") || ""};display:none`);
          continue;
        }
        for (const detail of row.querySelectorAll("details")) {
          const summary = detail.querySelector("summary")?.textContent || "";
          if (summary.includes("дополнительных официальных ссылок")) {
            detail.setAttribute("open", "");
          }
        }
      }
    }, PROJECT_NULL_GEOS);
    await table.screenshot({ path: outputPath, type: "png" });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const slot = await acquireProjectProcessSlot(
  `playwright:${browserName}:wiki-truth-live-probe`,
);
const browser = await browserTypeFor(browserName).launch({ headless });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const browserErrors = [];
const httpErrors = [];
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400) {
    httpErrors.push(`${response.status()} ${response.url()}`);
  }
});
page.on("requestfailed", (request) => {
  httpErrors.push(`FAILED ${request.url()} ${request.failure()?.errorText || ""}`);
});

try {
  await page.goto(`${BASE_URL}/wiki-truth`, { waitUntil: "domcontentloaded" });
  const screenshotBeforeError = await safeScreenshot(
    page,
    screenshotBeforePath,
  );
  await page.waitForSelector("[data-testid='wiki-truth-summary']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='cannabis-law-matrix-307']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='cannabis-law-color-table']", {
    timeout: 30000,
  });
  await waitForSelectorWithReload(
    page,
    "[data-testid='wiki-truth-acceptance-audit']",
    {
      timeout: 30000,
    },
  );
  await page.waitForSelector("[data-testid='wiki-truth-color-proposals']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='wiki-truth-color-apply-plan']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='wiki-truth-color-apply-gate']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='wiki-truth-color-review-dossier']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='wiki-truth-final-reconciliation']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='wiki-truth-runtime-apply-pipeline']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='wiki-truth-runtime-blocker-exit-dossier']", {
    timeout: 30000,
  });
  await page.waitForSelector("[data-testid='wiki-truth-primary-law-blockers']", {
    timeout: 30000,
  });
  await page.waitForSelector(
    "[data-testid='wiki-truth-color-proposals-table']",
    {
      timeout: 30000,
    },
  );
  await waitForSelectorWithReload(
    page,
    "[data-testid='wiki-truth-acceptance-requirements-table']",
    {
      timeout: 30000,
    },
  );
  await waitForSelectorWithReload(
    page,
    "[data-testid='wiki-truth-acceptance-rows-table']",
    {
      timeout: 30000,
      state: "attached",
    },
  );
  await page.waitForSelector(
    "[data-testid='wiki-truth-primary-law-blockers-table']",
    {
      timeout: 30000,
    },
  );
  await page.waitForSelector(
    "[data-testid='wiki-truth-color-apply-plan-table']",
    {
      timeout: 30000,
    },
  );
  await page.waitForSelector(
    "[data-testid='wiki-truth-color-apply-gate-table']",
    {
      timeout: 30000,
    },
  );
  await page.waitForSelector(
    "[data-testid='wiki-truth-color-review-dossier-table']",
    {
      timeout: 30000,
    },
  );
  await page.waitForSelector(
    "[data-testid='wiki-truth-legal-axis-matrix-table']",
    {
      timeout: 30000,
    },
  );
  await page.waitForSelector(
    "[data-testid='wiki-truth-legal-axis-schema-table']",
    {
      timeout: 30000,
    },
  );
  await page.waitForSelector(
    "[data-testid='wiki-truth-runtime-apply-pipeline-table']",
    {
      timeout: 30000,
    },
  );
  await page.waitForSelector(
    "[data-testid='wiki-truth-runtime-blocker-exit-dossier-table']",
    {
      timeout: 30000,
    },
  );
  await page.waitForSelector("[data-testid='wiki-truth-table']", {
    timeout: 30000,
    state: "attached",
  });
  await page.waitForSelector("[data-testid='wiki-truth-diagnostics']", {
    timeout: 30000,
    state: "attached",
  });
  await page.waitForSelector(
    "[data-testid='build-update-banner'][data-freshness-status='CURRENT']",
    { timeout: 30000 },
  );
  const screenshotAfterError = await safeScreenshot(page, screenshotAfterPath);

  const details = await page.evaluate(async () => {
    const metaResponse = await fetch("/api/build-meta", { cache: "no-store" });
    const buildMeta = metaResponse.ok ? await metaResponse.json() : null;
    return {
      origin: window.location.origin,
      href: window.location.href,
      title: document.title,
      summaryPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-summary']"),
      ),
      cannabisMatrixPresent: Boolean(
        document.querySelector("[data-testid='cannabis-law-matrix-307']"),
      ),
      cannabisColorTablePresent: Boolean(
        document.querySelector("[data-testid='cannabis-law-color-table']"),
      ),
      tablePresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-table']"),
      ),
      diagnosticsPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-diagnostics']"),
      ),
      recentChangesPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-recent-changes']"),
      ),
      freshnessStatus: document
        .querySelector("[data-testid='build-update-banner']")
        ?.getAttribute("data-freshness-status") || null,
      freshnessText:
        document.querySelector("[data-testid='build-update-banner']")
          ?.textContent || "",
      freshnessReloadButtonPresent: Array.from(
        document.querySelectorAll(
          "[data-testid='build-update-banner'] button",
        ),
      ).some((button) => button.textContent?.trim() === "Обновить"),
      rowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-table'] tbody tr",
      ).length,
      cannabisMatrixRowCount: document.querySelectorAll(
        "[data-testid='cannabis-law-matrix-307'] tbody tr",
      ).length,
      cannabisMatrixUniqueGeoCount: new Set(
        Array.from(
          document.querySelectorAll(
            "[data-testid='cannabis-law-matrix-307'] tbody tr[data-geo]",
          ),
        ).map((row) => row.getAttribute("data-geo") || ""),
      ).size,
      cannabisMatrixRowsWithoutLinks: Array.from(
        document.querySelectorAll(
          "[data-testid='cannabis-law-matrix-307'] tbody tr[data-geo]",
        ),
      )
        .filter((row) => !row.querySelector("a[href^='http']"))
        .map((row) => row.getAttribute("data-geo") || ""),
      cannabisMatrixOfficialLinkCount: Array.from(
        document.querySelectorAll(
          "[data-testid='cannabis-law-matrix-307'] a[href^='http']",
        ),
      ).filter((link) => !link.closest(".linkItem.fresh")).length,
      cannabisMatrixFreshSecondPassLinkCount: document.querySelectorAll(
        "[data-testid='cannabis-law-matrix-307'] .linkItem.fresh a[href^='http']",
      ).length,
      cannabisMatrixDeclaredOfficialLinkCount: Number(
        document
          .querySelector("[data-testid='cannabis-law-matrix-307']")
          ?.getAttribute("data-all-published-official-links") || 0,
      ),
      cannabisMatrixUnsafeLinks: Array.from(
        document.querySelectorAll(
          "[data-testid='cannabis-law-matrix-307'] a[href^='http']",
        ),
      )
        .filter(
          (link) =>
            link.getAttribute("target") !== "_blank" ||
            !String(link.getAttribute("rel") || "").includes("noreferrer") ||
            !String(link.getAttribute("rel") || "").includes("noopener"),
        )
        .map((link) => link.getAttribute("href") || ""),
      cannabisColorRowCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr",
      ).length,
      cannabisColorUniqueGeoCount: new Set(
        Array.from(
          document.querySelectorAll(
            "[data-testid='cannabis-law-color-table'] tbody tr[data-geo]",
          ),
        ).map((row) => row.getAttribute("data-geo") || ""),
      ).size,
      renderedTableCount: document.querySelectorAll(".auditView table").length,
      tableColumnMismatches: Array.from(
        document.querySelectorAll(".auditView table"),
      ).flatMap((table, index) => {
        const headers = table.querySelectorAll("thead th").length;
        const cells = Array.from(
          table.querySelectorAll("tbody tr:first-child td"),
        ).reduce(
          (total, cell) => total + Number(cell.getAttribute("colspan") || 1),
          0,
        );
        return headers && cells && headers !== cells
          ? [`${table.getAttribute("data-testid") || `table-${index}`}:${headers}/${cells}`]
          : [];
      }),
      cannabisColorDifferenceCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr[data-color-diff='1']",
      ).length,
      cannabisOfficialGreyCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr[data-official-color='UNKNOWN']",
      ).length,
      cannabisCurrentGreyCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr[data-current-color='UNKNOWN']",
      ).length,
      cannabisCurrentInsufficientDataCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr[data-current-label='Серый — недостаточно данных']",
      ).length,
      cannabisCurrentGreyGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='cannabis-law-color-table'] tbody tr[data-current-color='UNKNOWN']",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .sort(),
      projectNullOfficialColors: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='cannabis-law-color-table'] tbody tr[data-geo]",
          ),
        )
          .filter((row) =>
            ["BJN", "BRT", "SCR", "SER", "KAS", "SPI", "PGA"].includes(
              row.getAttribute("data-geo") || "",
            ),
          )
          .map((row) => [
            row.getAttribute("data-geo") || "",
            row.getAttribute("data-official-color") || "",
          ]),
      ),
      projectNullCurrentColors: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='cannabis-law-color-table'] tbody tr[data-geo]",
          ),
        )
          .filter((row) =>
            ["BJN", "BRT", "SCR", "SER", "KAS", "SPI", "PGA"].includes(
              row.getAttribute("data-geo") || "",
            ),
          )
          .map((row) => [
            row.getAttribute("data-geo") || "",
            row.getAttribute("data-current-color") || "",
          ]),
      ),
      cannabisColorReauditResolvedCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr[data-reaudit-result='COLOR_RESOLVED']",
      ).length,
      cannabisColorReauditRetainedGreyCount: document.querySelectorAll(
        "[data-testid='cannabis-law-color-table'] tbody tr[data-reaudit-result='HONEST_GREY_RETAINED']",
      ).length,
      acceptancePresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-acceptance-audit']"),
      ),
      acceptanceRequirementsTablePresent: Boolean(
        document.querySelector(
          "[data-testid='wiki-truth-acceptance-requirements-table']",
        ),
      ),
      acceptanceRowsTablePresent: Boolean(
        document.querySelector(
          "[data-testid='wiki-truth-acceptance-rows-table']",
        ),
      ),
      acceptanceCompleteAttr:
        document
          .querySelector("[data-testid='wiki-truth-acceptance-audit']")
          ?.getAttribute("data-complete") || "",
      acceptanceRowsTotalAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-acceptance-audit']")
          ?.getAttribute("data-rows-total") || -1,
      ),
      acceptanceRowsExpectedAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-acceptance-audit']")
          ?.getAttribute("data-rows-expected") || -1,
      ),
      acceptancePrimaryLawAll307Attr:
        document
          .querySelector("[data-testid='wiki-truth-acceptance-audit']")
          ?.getAttribute("data-primary-law-all-307") || "",
      acceptanceColorReviewClosedAll307Attr:
        document
          .querySelector("[data-testid='wiki-truth-acceptance-audit']")
          ?.getAttribute("data-color-review-closed-all-307") || "",
      acceptanceColorApplyPlanReadyAttr:
        document
          .querySelector("[data-testid='wiki-truth-acceptance-audit']")
          ?.getAttribute("data-color-apply-plan-ready") || "",
      acceptanceColorApplyGateFailClosedAttr:
        document
          .querySelector("[data-testid='wiki-truth-acceptance-audit']")
          ?.getAttribute("data-color-apply-gate-fail-closed") || "",
      acceptanceBlockerGeosAttr:
        document
          .querySelector("[data-testid='wiki-truth-acceptance-audit']")
          ?.getAttribute("data-blocker-geos") || "",
      acceptanceRequirementStatuses: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-acceptance-requirements-table'] tbody tr[data-requirement-key]",
          ),
        ).map((row) => [
          row.getAttribute("data-requirement-key") || "",
          row.getAttribute("data-status") || "",
        ]),
      ),
      acceptanceRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-acceptance-rows-table'] tbody tr[data-geo]",
      ).length,
      acceptanceUniqueGeoCount: new Set(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-acceptance-rows-table'] tbody tr[data-geo]",
          ),
        ).map((row) => row.getAttribute("data-geo") || ""),
      ).size,
      acceptanceGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-acceptance-rows-table'] tbody tr[data-geo]",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      acceptancePartialGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-acceptance-rows-table'] tbody tr[data-status]",
        ),
      )
        .filter((row) => row.getAttribute("data-status") !== "PROVEN")
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      colorProposalsPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-color-proposals']"),
      ),
      colorProposalsTablePresent: Boolean(
        document.querySelector(
          "[data-testid='wiki-truth-color-proposals-table']",
        ),
      ),
      primaryLawBlockersPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-primary-law-blockers']"),
      ),
      colorApplyPlanPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-color-apply-plan']"),
      ),
      colorApplyGatePresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-color-apply-gate']"),
      ),
      colorReviewDossierPresent: Boolean(
        document.querySelector(
          "[data-testid='wiki-truth-color-review-dossier']",
        ),
      ),
      primaryLawBlockersTablePresent: Boolean(
        document.querySelector(
          "[data-testid='wiki-truth-primary-law-blockers-table']",
        ),
      ),
      colorApplyPlanTablePresent: Boolean(
        document.querySelector(
          "[data-testid='wiki-truth-color-apply-plan-table']",
        ),
      ),
      colorApplyGateTablePresent: Boolean(
        document.querySelector(
          "[data-testid='wiki-truth-color-apply-gate-table']",
        ),
      ),
      colorReviewDossierTablePresent: Boolean(
        document.querySelector(
          "[data-testid='wiki-truth-color-review-dossier-table']",
        ),
      ),
      runtimeApplyPipelinePresent: Boolean(
        document.querySelector(
          "[data-testid='wiki-truth-runtime-apply-pipeline']",
        ),
      ),
      runtimeApplyPipelineTablePresent: Boolean(
        document.querySelector(
          "[data-testid='wiki-truth-runtime-apply-pipeline-table']",
        ),
      ),
      colorProposalsTotalAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-color-proposals']")
          ?.getAttribute("data-proposals-total") || -1,
      ),
      colorProposalsNonMutatingAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-proposals']")
          ?.getAttribute("data-non-mutating") || "",
      primaryLawBlockersTotalAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-primary-law-blockers']")
          ?.getAttribute("data-blockers-total") || -1,
      ),
      primaryLawBlockersNonMutatingAttr:
        document
          .querySelector("[data-testid='wiki-truth-primary-law-blockers']")
          ?.getAttribute("data-non-mutating") || "",
      colorApplyPlanRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-color-apply-plan']")
          ?.getAttribute("data-plan-rows") || -1,
      ),
      colorApplyPlanStatusAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-apply-plan']")
          ?.getAttribute("data-apply-status") || "",
      colorApplyPlanNonMutatingAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-apply-plan']")
          ?.getAttribute("data-non-mutating") || "",
      colorApplyPlanRequiresAuthorizationAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-apply-plan']")
          ?.getAttribute("data-requires-authorization") || "",
      colorApplyPlanAppliedRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-color-apply-plan']")
          ?.getAttribute("data-applied-rows") || -1,
      ),
      colorApplyGateStatusAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-apply-gate']")
          ?.getAttribute("data-gate-status") || "",
      colorApplyGateNonMutatingAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-apply-gate']")
          ?.getAttribute("data-non-mutating") || "",
      colorApplyGateLocalOnlyAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-apply-gate']")
          ?.getAttribute("data-local-only") || "",
      colorApplyGateAuthorizationAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-apply-gate']")
          ?.getAttribute("data-authorization-present") || "",
      colorApplyGateSsotWriteAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-apply-gate']")
          ?.getAttribute("data-ssot-write-enabled") || "",
      colorApplyGateAppliedRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-color-apply-gate']")
          ?.getAttribute("data-applied-rows") || -1,
      ),
      colorApplyGateBlockedRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-color-apply-gate']")
          ?.getAttribute("data-blocked-rows") || -1,
      ),
      colorApplyGateProductionTouchedAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-apply-gate']")
          ?.getAttribute("data-production-touched") || "",
      colorApplyGatePrimaryLawBlockersAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-apply-gate']")
          ?.getAttribute("data-primary-law-blockers") || "",
      colorReviewDossierStatusAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-review-status") || "",
      colorReviewDossierRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-rows-total") || -1,
      ),
      colorReviewDossierNonMutatingAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-non-mutating") || "",
      colorReviewDossierLocalOnlyAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-local-only") || "",
      colorReviewDossierAppliedRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-applied-rows") || -1,
      ),
      colorReviewDossierReadyPendingAuthorizationAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-ready-pending-authorization") || -1,
      ),
      runtimeApplyDryRunStatusAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-dry-run-status") || "",
      runtimeApplyPreflightStatusAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-preflight-status") || "",
      runtimeApplyExecutionStatusAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-execution-status") || "",
      runtimeApplyDryRunRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-dry-run-rows") || -1,
      ),
      runtimeApplyPreflightRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-preflight-rows") || -1,
      ),
      runtimeApplyExecutionRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-execution-rows") || -1,
      ),
      runtimeApplyTargetFilesAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-target-files") || -1,
      ),
      runtimeApplyTargetDriftFilesAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-target-drift-files") || -1,
      ),
      runtimeApplyAppliedRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-applied-rows") || -1,
      ),
      runtimeApplyWrittenTargetFilesAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-written-target-files") || -1,
      ),
      runtimeApplyWouldWriteNowAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-would-write-now") || -1,
      ),
      runtimeApplyFlagPresentAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-apply-flag-present") || "",
      runtimeApplyAuthorizationPresentAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-authorization-present") || "",
      runtimeApplySsotWriteEnabledAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-ssot-write-enabled") || "",
      runtimeApplyNonMutatingAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-non-mutating") || "",
      runtimeApplyProductionTouchedAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-production-touched") || "",
      runtimePostApplyStatusAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-status") || "",
      runtimePostApplySafeRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-safe-rows") || -1,
      ),
      runtimePostApplyNoOpRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-no-op-rows") || -1,
      ),
      runtimePostApplyBlockedRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-blocked-rows") || -1,
      ),
      runtimePostApplyTruthAlignedAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-truth-aligned") || -1,
      ),
      runtimePostApplyCoverageRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-coverage-rows") || -1,
      ),
      runtimePostApplyCoverageExpectedAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-coverage-expected") || -1,
      ),
      runtimePostApplyTargetFilesAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-target-files") || -1,
      ),
      runtimePostApplyAppliedRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-applied-rows") || -1,
      ),
      runtimePostApplyWouldApplyAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-would-apply") || -1,
      ),
      runtimePostApplyNonMutatingAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-non-mutating") || "",
      runtimePostApplyProductionTouchedAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-production-touched") || "",
      runtimePostApplySsotMutationAttemptedAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-ssot-mutation-attempted") || "",
      runtimePostApplyMapMutationAttemptedAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-post-apply-map-mutation-attempted") || "",
      blockerExitStatusAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-status") || "",
      blockerExitRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-rows") || -1,
      ),
      blockerExitDisputedTargetsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-disputed-targets") || -1,
      ),
      blockerExitRuntimeConflictsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-runtime-conflicts") || -1,
      ),
      blockerExitReadyNowAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-ready-now") || -1,
      ),
      blockerExitExcludedSafeAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-excluded-safe") || -1,
      ),
      blockerExitSafeRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-safe-rows") || -1,
      ),
      blockerExitNoOpRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-no-op-rows") || -1,
      ),
      blockerExitTruthAlignedAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-truth-aligned") || -1,
      ),
      blockerExitCoverageRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-coverage-rows") || -1,
      ),
      blockerExitTargetFilesAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-target-files") || -1,
      ),
      blockerExitAppliedRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-applied-rows") || -1,
      ),
      blockerExitNonMutatingAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-non-mutating") || "",
      blockerExitLocalOnlyAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-local-only") || "",
      blockerExitProductionTouchedAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-production-touched") || "",
      blockerExitSsotMutationAttemptedAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-ssot-mutation-attempted") || "",
      blockerExitMapMutationAttemptedAttr:
        document
          .querySelector("[data-testid='wiki-truth-runtime-apply-pipeline']")
          ?.getAttribute("data-blocker-exit-map-mutation-attempted") || "",
      runtimeApplyPipelineRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-runtime-apply-pipeline-table'] tbody tr[data-geo]",
      ).length,
      runtimePostApplyBlockedRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-runtime-post-apply-blocked-table'] tbody tr[data-geo]",
      ).length,
      runtimePostApplyBlockedGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-runtime-post-apply-blocked-table'] tbody tr[data-geo]",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      runtimePostApplyBlockedDecisionCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-runtime-post-apply-blocked-table'] tbody tr[data-decision]",
        ),
      ).reduce((counts, row) => {
        const decision = row.getAttribute("data-decision") || "";
        counts[decision] = (counts[decision] || 0) + 1;
        return counts;
      }, {}),
      blockerExitRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-runtime-blocker-exit-dossier-table'] tbody tr[data-geo]",
      ).length,
      blockerExitGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-runtime-blocker-exit-dossier-table'] tbody tr[data-geo]",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      blockerExitClassCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-runtime-blocker-exit-dossier-table'] tbody tr[data-blocker-class]",
        ),
      ).reduce((counts, row) => {
        const blockerClass = row.getAttribute("data-blocker-class") || "";
        counts[blockerClass] = (counts[blockerClass] || 0) + 1;
        return counts;
      }, {}),
      blockerExitConditionCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-runtime-blocker-exit-dossier-table'] tbody tr[data-exit-condition]",
        ),
      ).reduce((counts, row) => {
        const exitCondition = row.getAttribute("data-exit-condition") || "";
        counts[exitCondition] = (counts[exitCondition] || 0) + 1;
        return counts;
      }, {}),
      blockerExitExitReadyNowRows: document.querySelectorAll(
        "[data-testid='wiki-truth-runtime-blocker-exit-dossier-table'] tbody tr[data-exit-ready-now='1']",
      ).length,
      blockerExitExcludedSafeRows: document.querySelectorAll(
        "[data-testid='wiki-truth-runtime-blocker-exit-dossier-table'] tbody tr[data-excluded-from-safe-apply='1']",
      ).length,
      runtimeApplyPipelineGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-runtime-apply-pipeline-table'] tbody tr[data-geo]",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      runtimeApplyExecutionDecisionCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-runtime-apply-pipeline-table'] tbody tr[data-execution-decision]",
        ),
      ).reduce((counts, row) => {
        const decision = row.getAttribute("data-execution-decision") || "";
        counts[decision] = (counts[decision] || 0) + 1;
        return counts;
      }, {}),
      runtimeApplyBlockingReasonCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-runtime-apply-pipeline-table'] tbody tr[data-blocking-reasons]",
        ),
      ).reduce((counts, row) => {
        for (const reason of (row.getAttribute("data-blocking-reasons") || "").split(",")) {
          if (!reason) continue;
          counts[reason] = (counts[reason] || 0) + 1;
        }
        return counts;
      }, {}),
      runtimeApplyHashMatchesRows: document.querySelectorAll(
        "[data-testid='wiki-truth-runtime-apply-pipeline-table'] tbody tr[data-target-hash-matches-dry-run='1']",
      ).length,
      colorReviewDossierBlockedRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-blocked-rows") || -1,
      ),
      colorReviewDossierPrimaryLawBlockersAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-primary-law-blockers") || "",
      colorReviewDossierAllRowsHaveReviewDecisionAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-all-rows-have-review-decision") || "",
      colorReviewDossierAllRowsHaveLegalBasisAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-all-rows-have-legal-basis") || "",
      colorReviewDossierAllowedColorsOnlyAttr:
        document
          .querySelector("[data-testid='wiki-truth-color-review-dossier']")
          ?.getAttribute("data-allowed-colors-only") || "",
      legalAxisMatrixPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']"),
      ),
      legalAxisMatrixStatusAttr:
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-status") || "",
      legalAxisMatrixRowsTotalAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-rows-total") || -1,
      ),
      legalAxisMatrixRowsExpectedAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-rows-expected") || -1,
      ),
      legalAxisMatrixRequiredAxesAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-required-axis-total") || -1,
      ),
      legalAxisMatrixCellsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-cells-total") || -1,
      ),
      legalAxisMatrixKnownCellsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-known-axis-cells") || -1,
      ),
      legalAxisMatrixUnknownCellsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-unknown-axis-cells") || -1,
      ),
      legalAxisMatrixRowsWithUnknownAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-rows-with-unknown-axes") || -1,
      ),
      legalAxisMatrixRowsAllKnownAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-rows-with-all-axes-known") || -1,
      ),
      legalAxisMatrixNonMutatingAttr:
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-non-mutating") || "",
      legalAxisMatrixLocalOnlyAttr:
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-local-only") || "",
      legalAxisMatrixAppliedRowsAttr: Number(
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-applied-rows") || -1,
      ),
      legalAxisMatrixProductionTouchedAttr:
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-production-touched") || "",
      legalAxisMatrixSsotMutationAttemptedAttr:
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-ssot-mutation-attempted") || "",
      legalAxisMatrixMapMutationAttemptedAttr:
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-map-mutation-attempted") || "",
      legalAxisMatrixAllRowsHaveGroupsAttr:
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-all-rows-have-required-axis-groups") || "",
      legalAxisMatrixAllRowsHaveAxesAttr:
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-all-rows-have-all-required-axes") || "",
      legalAxisMatrixUnknownCellsExplicitAttr:
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-unknown-cells-explicit") || "",
      legalAxisMatrixNoMissingAxisCellsAttr:
        document
          .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
          ?.getAttribute("data-no-missing-axis-cells") || "",
      finalReconciliationPresent: Boolean(
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']"),
      ),
      finalReconciliationRowsTotalAttr: Number(
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']")
          ?.getAttribute("data-rows-total") || -1,
      ),
      finalReconciliationRowsExpectedAttr: Number(
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']")
          ?.getAttribute("data-rows-expected") || -1,
      ),
      finalReconciliationCompleteAttr:
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']")
          ?.getAttribute("data-complete") || "",
      finalReconciliationCrossLayerConflictsAttr: Number(
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']")
          ?.getAttribute("data-cross-layer-conflicts") || -1,
      ),
      finalReconciliationUnprovenGreenAttr: Number(
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']")
          ?.getAttribute("data-unproven-green") || -1,
      ),
      finalReconciliationNoMutationAttr:
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']")
          ?.getAttribute("data-no-mutation") || "",
      finalReconciliationTruthRedAttr: Number(
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']")
          ?.getAttribute("data-truth-red") || -1,
      ),
      finalReconciliationTruthYellowAttr: Number(
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']")
          ?.getAttribute("data-truth-yellow") || -1,
      ),
      finalReconciliationTruthGreenAttr: Number(
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']")
          ?.getAttribute("data-truth-green") || -1,
      ),
      finalReconciliationTruthUnknownAttr: Number(
        document.querySelector("[data-testid='wiki-truth-final-reconciliation']")
          ?.getAttribute("data-truth-unknown") || -1,
      ),
      colorProposalsRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-color-proposals-table'] tbody tr[data-proposal-action]",
      ).length,
      colorApplyPlanRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-color-apply-plan-table'] tbody tr[data-apply-disposition]",
      ).length,
      colorApplyGateRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-color-apply-gate-table'] tbody tr[data-gate-decision]",
      ).length,
      colorReviewDossierRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-color-review-dossier-table'] tbody tr[data-review-decision]",
      ).length,
      legalAxisMatrixRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-legal-axis-matrix-table'] tbody tr[data-geo]",
      ).length,
      legalAxisSchemaRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-legal-axis-schema-table'] tbody tr[data-axis-name]",
      ).length,
      primaryLawBlockersRowCount: document.querySelectorAll(
        "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-blocker-status]",
      ).length,
      colorProposalsUniqueGeoCount: new Set(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-color-proposals-table'] tbody tr[data-geo]",
          ),
        ).map((row) => row.getAttribute("data-geo") || ""),
      ).size,
      primaryLawBlockersUniqueGeoCount: new Set(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => row.getAttribute("data-geo") || ""),
      ).size,
      colorApplyPlanUniqueGeoCount: new Set(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-color-apply-plan-table'] tbody tr[data-geo]",
          ),
        ).map((row) => row.getAttribute("data-geo") || ""),
      ).size,
      colorApplyGateUniqueGeoCount: new Set(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-color-apply-gate-table'] tbody tr[data-geo]",
          ),
        ).map((row) => row.getAttribute("data-geo") || ""),
      ).size,
      colorReviewDossierUniqueGeoCount: new Set(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-color-review-dossier-table'] tbody tr[data-geo]",
          ),
        ).map((row) => row.getAttribute("data-geo") || ""),
      ).size,
      legalAxisMatrixUniqueGeoCount: new Set(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-legal-axis-matrix-table'] tbody tr[data-geo]",
          ),
        ).map((row) => row.getAttribute("data-geo") || ""),
      ).size,
      colorProposalGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-proposals-table'] tbody tr[data-geo]",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      primaryLawBlockerGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      colorApplyPlanGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-apply-plan-table'] tbody tr[data-geo]",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      colorApplyGateGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-apply-gate-table'] tbody tr[data-geo]",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      colorReviewDossierGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-review-dossier-table'] tbody tr[data-geo]",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      legalAxisMatrixGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-legal-axis-matrix-table'] tbody tr[data-geo]",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      legalAxisSchemaKeys: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-legal-axis-schema-table'] tbody tr[data-axis-name]",
        ),
      )
        .map((row) => `${row.getAttribute("data-axis-group") || ""}:${row.getAttribute("data-axis-name") || ""}`)
        .filter(Boolean)
        .sort(),
      colorApplyPlanDispositionCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-apply-plan-table'] tbody tr[data-apply-disposition]",
        ),
      ).reduce((counts, row) => {
        const disposition = row.getAttribute("data-apply-disposition") || "";
        counts[disposition] = (counts[disposition] || 0) + 1;
        return counts;
      }, {}),
      colorApplyGateDecisionCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-apply-gate-table'] tbody tr[data-gate-decision]",
        ),
      ).reduce((counts, row) => {
        const decision = row.getAttribute("data-gate-decision") || "";
        counts[decision] = (counts[decision] || 0) + 1;
        return counts;
      }, {}),
      colorReviewDossierDecisionCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-review-dossier-table'] tbody tr[data-review-decision]",
        ),
      ).reduce((counts, row) => {
        const decision = row.getAttribute("data-review-decision") || "";
        counts[decision] = (counts[decision] || 0) + 1;
        return counts;
      }, {}),
      colorReviewDossierLegalBasisCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-review-dossier-table'] tbody tr[data-legal-basis-class]",
        ),
      ).reduce((counts, row) => {
        const legalBasis = row.getAttribute("data-legal-basis-class") || "";
        counts[legalBasis] = (counts[legalBasis] || 0) + 1;
        return counts;
      }, {}),
      legalAxisMatrixTruthColorCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-legal-axis-matrix-table'] tbody tr[data-truth-color]",
        ),
      ).reduce((counts, row) => {
        const truthColor = row.getAttribute("data-truth-color") || "";
        counts[truthColor] = (counts[truthColor] || 0) + 1;
        return counts;
      }, {}),
      legalAxisMatrixRowsWithRequiredAxes: document.querySelectorAll(
        "[data-testid='wiki-truth-legal-axis-matrix-table'] tbody tr[data-required-axis-cells]",
      ).length,
      legalAxisMatrixRowsWithDomRequiredAxes: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-legal-axis-matrix-table'] tbody tr[data-required-axis-cells]",
        ),
      ).filter(
        (row) =>
          Number(row.getAttribute("data-required-axis-cells") || -1) ===
          Number(
            document
              .querySelector("[data-testid='wiki-truth-legal-knowledge-axis-matrix']")
              ?.getAttribute("data-required-axis-total") || -1,
          ),
      ).length,
      colorApplyPlanBlockedPrimaryLawGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-apply-plan-table'] tbody tr[data-blocked-primary-law='1']",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      primaryLawBlockerStatuses: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          row.getAttribute("data-blocker-status") || "",
        ]),
      ),
      primaryLawBlockerColors: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          row.getAttribute("data-proposed-truth-color") || "",
        ]),
      ),
      primaryLawBlockerNegativeSearches: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          row.getAttribute("data-negative-searches") || "",
        ]),
      ),
      primaryLawBlockerBoundaries: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          row.getAttribute("data-known-primary-boundary") || "",
        ]),
      ),
      primaryLawBlockerCollectorHasCannabisPages: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          row.getAttribute("data-collector-has-cannabis-pages") || "",
        ]),
      ),
      primaryLawBlockerCollectorFetchedCandidates: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          Number(row.getAttribute("data-collector-fetched-candidates") || 0),
        ]),
      ),
      primaryLawBlockerVisualScreenshots: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          Number(row.getAttribute("data-visual-screenshots") || 0),
        ]),
      ),
      primaryLawBlockerFreshSearchResults: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          row.getAttribute("data-fresh-search-result") || "",
        ]),
      ),
      primaryLawBlockerFreshSearchQueryCounts: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          Number(row.getAttribute("data-fresh-search-query-count") || 0),
        ]),
      ),
      primaryLawBlockerFreshSearchSourceCounts: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          Number(row.getAttribute("data-fresh-search-source-count") || 0),
        ]),
      ),
      primaryLawBlockerFreshSearchDirectFinds: Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            "[data-testid='wiki-truth-primary-law-blockers-table'] tbody tr[data-geo]",
          ),
        ).map((row) => [
          row.getAttribute("data-geo") || "",
          Number(row.getAttribute("data-fresh-search-direct-finds") || 0),
        ]),
      ),
      colorProposalActionCounts: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-proposals-table'] tbody tr[data-proposal-action]",
        ),
      ).reduce((counts, row) => {
        const action = row.getAttribute("data-proposal-action") || "";
        counts[action] = (counts[action] || 0) + 1;
        return counts;
      }, {}),
      removeColorPendingProofGeos: Array.from(
        document.querySelectorAll(
          "[data-testid='wiki-truth-color-proposals-table'] tbody tr[data-proposal-action='REMOVE_COLOR_PENDING_APPLICABLE_LAW_PROOF']",
        ),
      )
        .map((row) => row.getAttribute("data-geo") || "")
        .filter(Boolean)
        .sort(),
      cannabisOfficialUrlGeoCount: Number(
        document
          .querySelector("[data-testid='cannabis-law-matrix-307']")
          ?.getAttribute("data-official-url-geos") || 0,
      ),
      cannabisNoProjectStatusCount: Number(
        document
          .querySelector("[data-testid='cannabis-law-matrix-307']")
          ?.getAttribute("data-no-project-status") || 0,
      ),
      cannabisSupplementalOfficialLinkCount: document.querySelectorAll(
        "[data-testid='cannabis-law-matrix-307'] .linkItem.supplemental",
      ).length,
      cannabisSupplementalOfficialLinkDeclared: Number(
        document
          .querySelector("[data-testid='cannabis-law-matrix-307']")
          ?.getAttribute("data-supplemental-official-links") || 0,
      ),
      ownershipMissingCount: Number(
        document
          .querySelector("[data-testid='wiki-truth-issues']")
          ?.getAttribute("data-official-ownership-missing") || 0,
      ),
      auditHeaderCount: document.querySelectorAll(
        "[data-testid='wiki-truth-audit-table'] thead th",
      ).length,
      auditFirstRowCellCount: document.querySelectorAll(
        "[data-testid='wiki-truth-audit-table'] tbody tr:first-child td",
      ).length,
      buildMeta,
    };
  });
  const projectNullColorScreenshotError = await captureProjectNullRows(
    page,
    "cannabis-law-color-comparison",
    projectNullColorScreenshotPath,
  );
  const projectNullMatrixScreenshotError = await captureProjectNullRows(
    page,
    "cannabis-law-matrix-307",
    projectNullMatrixScreenshotPath,
  );

  const pass = Boolean(
    details.origin === BASE_URL &&
    details.summaryPresent &&
    details.cannabisMatrixPresent &&
    details.cannabisColorTablePresent &&
    details.tablePresent &&
    details.diagnosticsPresent &&
    details.recentChangesPresent &&
    details.freshnessStatus === "CURRENT" &&
    details.freshnessText.includes("Страница актуальна") &&
    details.freshnessReloadButtonPresent &&
    details.rowCount > 0 &&
    details.cannabisMatrixRowCount === 307 &&
    details.cannabisMatrixUniqueGeoCount === 307 &&
    details.cannabisMatrixRowsWithoutLinks.length === 0 &&
    details.cannabisMatrixOfficialLinkCount ===
      details.cannabisMatrixDeclaredOfficialLinkCount &&
    details.cannabisMatrixUnsafeLinks.length === 0 &&
    details.cannabisColorRowCount === 307 &&
    details.cannabisColorUniqueGeoCount === 307 &&
    details.renderedTableCount >= 9 &&
    details.tableColumnMismatches.length === 0 &&
    details.cannabisCurrentGreyCount === 7 &&
    details.cannabisCurrentInsufficientDataCount === 0 &&
    JSON.stringify(details.cannabisCurrentGreyGeos) ===
      JSON.stringify(["BJN", "BRT", "KAS", "PGA", "SCR", "SER", "SPI"]) &&
    Object.values(details.projectNullCurrentColors).length === 7 &&
    Object.values(details.projectNullCurrentColors).every(
      (category) => category === "UNKNOWN",
    ) &&
    Object.values(details.projectNullOfficialColors).length === 7 &&
    Object.entries(details.projectNullOfficialColors).every(
      ([geo, category]) =>
        PROJECT_NULL_GEOS.includes(geo) &&
        Object.prototype.hasOwnProperty.call(
          EXPECTED_PROJECT_NULL_OFFICIAL_COLORS,
          category,
        ),
    ) &&
    details.cannabisColorReauditResolvedCount === 39 &&
    details.cannabisColorReauditRetainedGreyCount === 0 &&
    details.colorProposalsPresent &&
    details.colorProposalsTablePresent &&
    details.acceptancePresent &&
    details.acceptanceRequirementsTablePresent &&
    details.acceptanceRowsTablePresent &&
    details.primaryLawBlockersPresent &&
    details.primaryLawBlockersTablePresent &&
    details.colorApplyPlanPresent &&
    details.colorApplyPlanTablePresent &&
    details.colorApplyGatePresent &&
    details.colorApplyGateTablePresent &&
    details.colorReviewDossierPresent &&
    details.colorReviewDossierTablePresent &&
    details.runtimeApplyPipelinePresent &&
    details.runtimeApplyPipelineTablePresent &&
    colorProposalsArtifact.nonMutating === true &&
    primaryLawBlockersArtifact.nonMutating === true &&
    colorApplyPlanArtifact.nonMutating === true &&
    colorApplyGateArtifact.nonMutating === true &&
    colorReviewDossierArtifact.nonMutating === true &&
    legalKnowledgeAxisMatrixArtifact.nonMutating === true &&
    runtimeApplyExecutionArtifact.nonMutating === true &&
    runtimePostApplyVerificationArtifact.nonMutating === true &&
    blockerExitDossierArtifact.nonMutating === true &&
    details.colorProposalsNonMutatingAttr === "1" &&
    details.primaryLawBlockersNonMutatingAttr === "1" &&
    details.colorApplyPlanNonMutatingAttr === "1" &&
    details.colorApplyGateNonMutatingAttr === "1" &&
    details.colorReviewDossierNonMutatingAttr === "1" &&
    details.legalAxisMatrixNonMutatingAttr === "1" &&
    details.legalAxisMatrixLocalOnlyAttr === "1" &&
    details.runtimeApplyNonMutatingAttr === "1" &&
    details.runtimePostApplyNonMutatingAttr === "1" &&
    details.blockerExitNonMutatingAttr === "1" &&
    details.blockerExitLocalOnlyAttr === "1" &&
    details.colorApplyGateLocalOnlyAttr === "1" &&
    details.colorReviewDossierLocalOnlyAttr === "1" &&
    colorApplyPlanArtifact.requiresExplicitAuthorization === true &&
    colorApplyPlanArtifact.safeToAutoApply === false &&
    details.colorApplyPlanRequiresAuthorizationAttr === "1" &&
    details.colorApplyPlanStatusAttr === "PENDING_AUTHORIZATION" &&
    colorApplyPlanArtifact.applyStatus === "PENDING_AUTHORIZATION" &&
    details.colorApplyPlanAppliedRowsAttr === 0 &&
    colorApplyGateArtifact.gateStatus === "BLOCKED_FAIL_CLOSED" &&
    details.colorApplyGateStatusAttr === "BLOCKED_FAIL_CLOSED" &&
    details.colorApplyGateAuthorizationAttr === "0" &&
    details.colorApplyGateSsotWriteAttr === "0" &&
    details.colorApplyGateAppliedRowsAttr === 0 &&
    details.colorApplyGateBlockedRowsAttr === expectedColorApplyGateTotal &&
    details.colorApplyGateProductionTouchedAttr === "0" &&
    details.colorApplyGatePrimaryLawBlockersAttr ===
      expectedColorApplyGatePrimaryLawBlockers &&
    details.colorReviewDossierStatusAttr ===
      String(colorReviewDossierArtifact.reviewStatus || "") &&
    details.colorReviewDossierRowsAttr === expectedColorReviewDossierTotal &&
    details.colorReviewDossierAppliedRowsAttr === 0 &&
    details.colorReviewDossierReadyPendingAuthorizationAttr ===
      Number(colorReviewDossierArtifact.readyPendingAuthorizationRows || 0) &&
    details.colorReviewDossierBlockedRowsAttr ===
      Number(colorReviewDossierArtifact.blockedRows || 0) &&
    details.colorReviewDossierPrimaryLawBlockersAttr ===
      expectedColorReviewDossierPrimaryLawBlockers &&
    details.colorReviewDossierAllRowsHaveReviewDecisionAttr === "1" &&
    details.colorReviewDossierAllRowsHaveLegalBasisAttr === "1" &&
    details.colorReviewDossierAllowedColorsOnlyAttr === "1" &&
    details.legalAxisMatrixPresent &&
    details.legalAxisMatrixStatusAttr ===
      String(legalKnowledgeAxisMatrixArtifact.matrixStatus || "") &&
    details.legalAxisMatrixRowsTotalAttr ===
      Number(legalKnowledgeAxisMatrixArtifact.rowsTotal || 0) &&
    details.legalAxisMatrixRowsExpectedAttr ===
      Number(legalKnowledgeAxisMatrixArtifact.rowsExpected || 0) &&
    details.legalAxisMatrixRequiredAxesAttr ===
      Number(legalKnowledgeAxisMatrixArtifact.requiredAxisTotal || 0) &&
    details.legalAxisMatrixCellsAttr ===
      Number(legalKnowledgeAxisMatrixArtifact.cellsTotal || 0) &&
    details.legalAxisMatrixKnownCellsAttr ===
      Number(legalKnowledgeAxisMatrixArtifact.summary?.knownAxisCells || 0) &&
    details.legalAxisMatrixUnknownCellsAttr ===
      Number(legalKnowledgeAxisMatrixArtifact.summary?.unknownAxisCells || 0) &&
    details.legalAxisMatrixRowsWithUnknownAttr ===
      Number(legalKnowledgeAxisMatrixArtifact.summary?.rowsWithUnknownAxes || 0) &&
    details.legalAxisMatrixRowsAllKnownAttr ===
      Number(legalKnowledgeAxisMatrixArtifact.summary?.rowsWithAllAxesKnown || 0) &&
    details.legalAxisMatrixAppliedRowsAttr === 0 &&
    details.legalAxisMatrixProductionTouchedAttr === "0" &&
    details.legalAxisMatrixSsotMutationAttemptedAttr === "0" &&
    details.legalAxisMatrixMapMutationAttemptedAttr === "0" &&
    details.legalAxisMatrixAllRowsHaveGroupsAttr === "1" &&
    details.legalAxisMatrixAllRowsHaveAxesAttr === "1" &&
    details.legalAxisMatrixUnknownCellsExplicitAttr === "1" &&
    details.legalAxisMatrixNoMissingAxisCellsAttr === "1" &&
    details.finalReconciliationPresent &&
    details.finalReconciliationCompleteAttr ===
      (finalReconciliationArtifact.complete === true ? "1" : "0") &&
    finalReconciliationArtifact.acceptance?.complete ===
      (acceptanceAuditArtifact.complete === true) &&
    finalReconciliationArtifact.noMutationProof?.unchanged === true &&
    details.finalReconciliationRowsTotalAttr ===
      Number(finalReconciliationArtifact.rowsTotal || 0) &&
    details.finalReconciliationRowsExpectedAttr ===
      Number(finalReconciliationArtifact.rowsExpected || 0) &&
    details.finalReconciliationCompleteAttr ===
      (finalReconciliationArtifact.complete === true ? "1" : "0") &&
    details.finalReconciliationCrossLayerConflictsAttr ===
      Number(finalReconciliationArtifact.acceptance?.crossLayerConflictRows?.length || 0) &&
    details.finalReconciliationUnprovenGreenAttr ===
      Number(finalReconciliationArtifact.acceptance?.unprovenGreenRows?.length || 0) &&
    details.finalReconciliationNoMutationAttr === "1" &&
    details.finalReconciliationTruthRedAttr ===
      Number(expectedFinalTruthColorCounts.RED || 0) &&
    details.finalReconciliationTruthYellowAttr ===
      Number(expectedFinalTruthColorCounts.YELLOW || 0) &&
    details.finalReconciliationTruthGreenAttr ===
      Number(expectedFinalTruthColorCounts.GREEN || 0) &&
    details.finalReconciliationTruthUnknownAttr ===
      Number(expectedFinalTruthColorCounts.UNKNOWN || 0) &&
    details.runtimeApplyDryRunStatusAttr ===
      String(runtimeApplyDryRunDiffArtifact.dryRunStatus || "") &&
    details.runtimeApplyPreflightStatusAttr ===
      String(runtimeApplyPreflightArtifact.preflightStatus || "") &&
    details.runtimeApplyExecutionStatusAttr ===
      String(runtimeApplyExecutionArtifact.executionStatus || "") &&
    details.runtimeApplyDryRunRowsAttr ===
      Number(runtimeApplyDryRunDiffArtifact.rowsTotal || 0) &&
    details.runtimeApplyPreflightRowsAttr ===
      Number(runtimeApplyPreflightArtifact.rowsTotal || 0) &&
    details.runtimeApplyExecutionRowsAttr === expectedRuntimeApplyExecutionTotal &&
    details.runtimeApplyTargetFilesAttr ===
      Number(runtimeApplyPreflightArtifact.targetFilesTotal || 0) &&
    details.runtimeApplyTargetDriftFilesAttr === 0 &&
    details.runtimeApplyAppliedRowsAttr === 0 &&
    details.runtimeApplyWrittenTargetFilesAttr === 0 &&
    details.runtimeApplyWouldWriteNowAttr === 0 &&
    details.runtimeApplyFlagPresentAttr === "0" &&
    details.runtimeApplyAuthorizationPresentAttr === "0" &&
    details.runtimeApplySsotWriteEnabledAttr === "0" &&
    details.runtimeApplyProductionTouchedAttr === "0" &&
    details.runtimePostApplyStatusAttr ===
      String(runtimePostApplyVerificationArtifact.postApplyStatus || "") &&
    details.runtimePostApplySafeRowsAttr ===
      Number(runtimePostApplyVerificationArtifact.summary?.safeRows || 0) &&
    details.runtimePostApplyNoOpRowsAttr ===
      Number(runtimePostApplyVerificationArtifact.summary?.noOpRows || 0) &&
    details.runtimePostApplyBlockedRowsAttr ===
      Number(runtimePostApplyVerificationArtifact.summary?.blockedRows || 0) &&
    details.runtimePostApplyTruthAlignedAttr ===
      Number(runtimePostApplyVerificationArtifact.truthAlignedRowsAfterAuthorizedApply || 0) &&
    details.runtimePostApplyCoverageRowsAttr ===
      Number(runtimePostApplyVerificationArtifact.coverageRowsTotal || 0) &&
    details.runtimePostApplyCoverageExpectedAttr ===
      Number(runtimePostApplyVerificationArtifact.coverageRowsExpected || 0) &&
    details.runtimePostApplyTargetFilesAttr ===
      Number(runtimePostApplyVerificationArtifact.targetFilesTotal || 0) &&
    details.runtimePostApplyAppliedRowsAttr === 0 &&
    details.runtimePostApplyWouldApplyAttr ===
      Number(runtimePostApplyVerificationArtifact.wouldApplyRowsAfterAuthorization || 0) &&
    details.runtimePostApplyProductionTouchedAttr === "0" &&
    details.runtimePostApplySsotMutationAttemptedAttr === "0" &&
    details.runtimePostApplyMapMutationAttemptedAttr === "0" &&
    details.blockerExitStatusAttr ===
      String(blockerExitDossierArtifact.dossierStatus || "") &&
    details.blockerExitRowsAttr ===
      Number(blockerExitDossierArtifact.summary?.blockedRowsTotal || 0) &&
    details.blockerExitDisputedTargetsAttr ===
      Number(blockerExitDossierArtifact.summary?.disputedTargetBlockers || 0) &&
    details.blockerExitRuntimeConflictsAttr ===
      Number(blockerExitDossierArtifact.summary?.runtimeTruthConflictBlockers || 0) &&
    details.blockerExitReadyNowAttr ===
      Number(blockerExitDossierArtifact.summary?.exitReadyNow || 0) &&
    details.blockerExitExcludedSafeAttr ===
      Number(blockerExitDossierArtifact.summary?.excludedFromSafeApply || 0) &&
    details.blockerExitSafeRowsAttr ===
      Number(blockerExitDossierArtifact.summary?.safeApplyRows || 0) &&
    details.blockerExitNoOpRowsAttr ===
      Number(blockerExitDossierArtifact.summary?.noOpRows || 0) &&
    details.blockerExitTruthAlignedAttr ===
      Number(blockerExitDossierArtifact.summary?.postApplyTruthAlignedRows || 0) &&
    details.blockerExitCoverageRowsAttr ===
      Number(blockerExitDossierArtifact.summary?.postApplyCoverageRows || 0) &&
    details.blockerExitTargetFilesAttr ===
      Number(blockerExitDossierArtifact.summary?.targetFiles || 0) &&
    details.blockerExitAppliedRowsAttr === 0 &&
    details.blockerExitProductionTouchedAttr === "0" &&
    details.blockerExitSsotMutationAttemptedAttr === "0" &&
    details.blockerExitMapMutationAttemptedAttr === "0" &&
    details.colorProposalsTotalAttr === expectedColorProposalTotal &&
    details.primaryLawBlockersTotalAttr === expectedPrimaryLawBlockersTotal &&
    details.colorApplyPlanRowsAttr === expectedColorApplyPlanTotal &&
    details.acceptanceCompleteAttr ===
      (acceptanceAuditArtifact.complete === true ? "1" : "0") &&
    details.acceptanceRowsTotalAttr === expectedAcceptanceRowsTotal &&
    details.acceptanceRowsExpectedAttr === expectedAcceptanceRowsExpected &&
    expectedAcceptanceRowsTotal === 307 &&
    expectedAcceptanceRowsExpected === 307 &&
    details.acceptancePrimaryLawAll307Attr ===
      expectedAcceptanceRequirementStatuses.primaryLawAll307 &&
    details.acceptanceColorReviewClosedAll307Attr ===
      expectedAcceptanceRequirementStatuses.colorReviewClosedAll307 &&
    details.acceptanceColorApplyPlanReadyAttr ===
      expectedAcceptanceRequirementStatuses.colorApplyPlanReady &&
    details.acceptanceColorApplyGateFailClosedAttr ===
      expectedAcceptanceRequirementStatuses.colorApplyGateFailClosed &&
    details.acceptanceBlockerGeosAttr === expectedAcceptancePartialGeos.join(",") &&
    details.acceptanceRowCount === expectedAcceptanceRowsTotal &&
    details.acceptanceUniqueGeoCount === expectedAcceptanceRowsTotal &&
    JSON.stringify(details.acceptanceGeos) ===
      JSON.stringify(expectedAcceptanceGeos) &&
    JSON.stringify(details.acceptancePartialGeos) ===
      JSON.stringify(expectedAcceptancePartialGeos) &&
    stableJson(details.acceptanceRequirementStatuses) ===
      stableJson(expectedAcceptanceRequirementStatuses) &&
    details.colorProposalsRowCount === expectedColorProposalTotal &&
    details.primaryLawBlockersRowCount === expectedPrimaryLawBlockersTotal &&
    details.colorApplyPlanRowCount === expectedColorApplyPlanTotal &&
    details.colorApplyGateRowCount === expectedColorApplyGateTotal &&
    details.colorReviewDossierRowCount === expectedColorReviewDossierTotal &&
    details.legalAxisMatrixRowCount === expectedLegalAxisMatrixRows.length &&
    details.legalAxisSchemaRowCount === expectedLegalAxisSchemaRows.length &&
    details.runtimeApplyPipelineRowCount === expectedRuntimeApplyExecutionTotal &&
    details.runtimePostApplyBlockedRowCount ===
      expectedRuntimePostApplyBlockedTotal &&
    details.blockerExitRowCount === expectedBlockerExitRows.length &&
    details.colorProposalsUniqueGeoCount === expectedColorProposalTotal &&
    details.primaryLawBlockersUniqueGeoCount ===
      expectedPrimaryLawBlockersTotal &&
    details.colorApplyPlanUniqueGeoCount === expectedColorApplyPlanTotal &&
    details.colorApplyGateUniqueGeoCount === expectedColorApplyGateTotal &&
    details.colorReviewDossierUniqueGeoCount ===
      expectedColorReviewDossierTotal &&
    details.legalAxisMatrixUniqueGeoCount === expectedLegalAxisMatrixRows.length &&
    JSON.stringify(details.colorProposalGeos) ===
      JSON.stringify(expectedColorProposalGeos) &&
    JSON.stringify(details.primaryLawBlockerGeos) ===
      JSON.stringify(expectedPrimaryLawBlockerGeos) &&
    JSON.stringify(details.colorApplyPlanGeos) ===
      JSON.stringify(expectedColorApplyPlanGeos) &&
    JSON.stringify(details.colorApplyGateGeos) ===
      JSON.stringify(expectedColorApplyGateGeos) &&
    JSON.stringify(details.colorReviewDossierGeos) ===
      JSON.stringify(expectedColorReviewDossierGeos) &&
    JSON.stringify(details.legalAxisMatrixGeos) ===
      JSON.stringify(expectedLegalAxisMatrixGeos) &&
    JSON.stringify(details.legalAxisSchemaKeys) ===
      JSON.stringify(expectedLegalAxisSchemaKeys) &&
    JSON.stringify(details.runtimeApplyPipelineGeos) ===
      JSON.stringify(expectedRuntimeApplyExecutionGeos) &&
    JSON.stringify(details.runtimePostApplyBlockedGeos) ===
      JSON.stringify(expectedRuntimePostApplyBlockedGeos) &&
    JSON.stringify(details.blockerExitGeos) ===
      JSON.stringify(expectedBlockerExitGeos) &&
    stableJson(details.colorProposalActionCounts) ===
      stableJson(expectedColorProposalActionCounts) &&
    stableJson(details.colorApplyPlanDispositionCounts) ===
      stableJson(expectedColorApplyPlanDispositionCounts) &&
    stableJson(details.colorApplyGateDecisionCounts) ===
      stableJson(expectedColorApplyGateDecisionCounts) &&
    stableJson(details.colorReviewDossierDecisionCounts) ===
      stableJson(expectedColorReviewDossierDecisionCounts) &&
    stableJson(details.colorReviewDossierLegalBasisCounts) ===
      stableJson(expectedColorReviewDossierLegalBasisCounts) &&
    stableJson(details.legalAxisMatrixTruthColorCounts) ===
      stableJson(expectedLegalAxisTruthColorCounts) &&
    details.legalAxisMatrixRowsWithRequiredAxes === expectedLegalAxisMatrixRows.length &&
    details.legalAxisMatrixRowsWithDomRequiredAxes === expectedLegalAxisMatrixRows.length &&
    stableJson(details.runtimeApplyExecutionDecisionCounts) ===
      stableJson(expectedRuntimeApplyExecutionDecisionCounts) &&
    stableJson(details.runtimeApplyBlockingReasonCounts) ===
      stableJson(expectedRuntimeApplyExecutionBlockingReasonCounts) &&
    stableJson(details.runtimePostApplyBlockedDecisionCounts) ===
      stableJson(expectedRuntimePostApplyBlockedDecisionCounts) &&
    stableJson(details.blockerExitClassCounts) ===
      stableJson(expectedBlockerExitClassCounts) &&
    stableJson(details.blockerExitConditionCounts) ===
      stableJson(expectedBlockerExitConditionCounts) &&
    details.blockerExitExitReadyNowRows === 0 &&
    details.blockerExitExcludedSafeRows === expectedBlockerExitRows.length &&
    details.runtimeApplyHashMatchesRows === expectedRuntimeApplyExecutionTotal &&
    JSON.stringify(details.colorApplyPlanBlockedPrimaryLawGeos) ===
      JSON.stringify(expectedColorApplyPlanBlockedPrimaryLawGeos) &&
    stableJson(details.primaryLawBlockerStatuses) ===
      stableJson(expectedPrimaryLawBlockerStatuses) &&
    stableJson(details.primaryLawBlockerColors) ===
      stableJson(expectedPrimaryLawBlockerColors) &&
    stableJson(details.primaryLawBlockerNegativeSearches) ===
      stableJson(expectedPrimaryLawBlockerNegativeSearches) &&
    stableJson(details.primaryLawBlockerBoundaries) ===
      stableJson(expectedPrimaryLawBlockerBoundaries) &&
    stableJson(details.primaryLawBlockerCollectorHasCannabisPages) ===
      stableJson(expectedPrimaryLawBlockerCollectorHasCannabisPages) &&
    stableJson(details.primaryLawBlockerCollectorFetchedCandidates) ===
      stableJson(expectedPrimaryLawBlockerCollectorFetchedCandidates) &&
    stableJson(details.primaryLawBlockerVisualScreenshots) ===
      stableJson(expectedPrimaryLawBlockerVisualScreenshots) &&
    stableJson(details.primaryLawBlockerFreshSearchResults) ===
      stableJson(expectedPrimaryLawBlockerFreshSearchResults) &&
    stableJson(details.primaryLawBlockerFreshSearchQueryCounts) ===
      stableJson(expectedPrimaryLawBlockerFreshSearchQueryCounts) &&
    stableJson(details.primaryLawBlockerFreshSearchSourceCounts) ===
      stableJson(expectedPrimaryLawBlockerFreshSearchSourceCounts) &&
    stableJson(details.primaryLawBlockerFreshSearchDirectFinds) ===
      stableJson(expectedPrimaryLawBlockerFreshSearchDirectFinds) &&
    JSON.stringify(details.removeColorPendingProofGeos) ===
      JSON.stringify(expectedRemoveColorPendingProofGeos) &&
    details.cannabisOfficialUrlGeoCount === 307 &&
    details.cannabisNoProjectStatusCount === 7 &&
    details.cannabisSupplementalOfficialLinkCount >= 41 &&
    details.cannabisSupplementalOfficialLinkCount ===
      details.cannabisSupplementalOfficialLinkDeclared &&
    details.ownershipMissingCount === 6 &&
    details.auditHeaderCount === 23 &&
    details.auditFirstRowCellCount === details.auditHeaderCount &&
    browserErrors.length === 0 &&
    httpErrors.length === 0 &&
    details.buildMeta?.expectedOrigin === BASE_URL,
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    browserName,
    headless,
    pass,
    screenshotBeforeError,
    screenshotAfterError,
    projectNullColorScreenshotError,
    projectNullMatrixScreenshotError,
    browserErrors,
    httpErrors,
    ...details,
    screenshotBeforePath: path.relative(ROOT, screenshotBeforePath),
    screenshotAfterPath: path.relative(ROOT, screenshotAfterPath),
  };

  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2));

  console.log(`WIKI_TRUTH_LIVE_OK=${pass ? 1 : 0}`);
  console.log(`WIKI_TRUTH_ROW_COUNT=${details.rowCount}`);
  console.log(
    `WIKI_TRUTH_CANNABIS_MATRIX_ROW_COUNT=${details.cannabisMatrixRowCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_MATRIX_UNIQUE_GEOS=${details.cannabisMatrixUniqueGeoCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_MATRIX_OFFICIAL_LINKS=${details.cannabisMatrixOfficialLinkCount}/${details.cannabisMatrixDeclaredOfficialLinkCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_MATRIX_FRESH_SECOND_PASS_LINKS=${details.cannabisMatrixFreshSecondPassLinkCount}`,
  );
  console.log(`WIKI_TRUTH_TABLE_COUNT=${details.renderedTableCount}`);
  console.log(
    `WIKI_TRUTH_TABLE_COLUMN_MISMATCHES=${details.tableColumnMismatches.length}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_COLOR_ROW_COUNT=${details.cannabisColorRowCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_COLOR_DIFFERENCE_COUNT=${details.cannabisColorDifferenceCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_OFFICIAL_GREY_COUNT=${details.cannabisOfficialGreyCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_CURRENT_GREY_COUNT=${details.cannabisCurrentGreyCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_CURRENT_FALSE_INSUFFICIENT=${details.cannabisCurrentInsufficientDataCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_CURRENT_GREY_GEOS=${details.cannabisCurrentGreyGeos.join(",")}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_NO_PROJECT_STATUS=${details.cannabisNoProjectStatusCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_SUPPLEMENTAL_OFFICIAL_LINKS=${details.cannabisSupplementalOfficialLinkCount}`,
  );
  console.log(
    `WIKI_TRUTH_OFFICIAL_OWNERSHIP_MISSING=${details.ownershipMissingCount}`,
  );
  console.log(
    `WIKI_TRUTH_AUDIT_TABLE_COLUMNS=${details.auditHeaderCount}/${details.auditFirstRowCellCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_COLOR_REAUDIT_RESOLVED=${details.cannabisColorReauditResolvedCount}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_COLOR_REAUDIT_RETAINED_GREY=${details.cannabisColorReauditRetainedGreyCount}`,
  );
  console.log(
    `WIKI_TRUTH_ACCEPTANCE_COMPLETE=${details.acceptanceCompleteAttr}`,
  );
  console.log(
    `WIKI_TRUTH_ACCEPTANCE_ROWS=${details.acceptanceRowCount}/${expectedAcceptanceRowsExpected}`,
  );
  console.log(
    `WIKI_TRUTH_ACCEPTANCE_PARTIAL_GEOS=${details.acceptancePartialGeos.join(",")}`,
  );
  console.log(
    `WIKI_TRUTH_ACCEPTANCE_REQUIREMENT_PRIMARYLAWALL307=${details.acceptancePrimaryLawAll307Attr}`,
  );
  console.log(
    `WIKI_TRUTH_ACCEPTANCE_REQUIREMENT_COLORREVIEWCLOSEDALL307=${details.acceptanceColorReviewClosedAll307Attr}`,
  );
  console.log(
    `WIKI_TRUTH_ACCEPTANCE_REQUIREMENT_COLORAPPLYPLANREADY=${details.acceptanceColorApplyPlanReadyAttr}`,
  );
  console.log(
    `WIKI_TRUTH_ACCEPTANCE_REQUIREMENT_COLORAPPLYGATEFAILCLOSED=${details.acceptanceColorApplyGateFailClosedAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_PROPOSALS=${details.colorProposalsRowCount}/${expectedColorProposalTotal}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_PROPOSALS_NON_MUTATING=${details.colorProposalsNonMutatingAttr === "1" && colorProposalsArtifact.nonMutating === true ? 1 : 0}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_PROPOSALS_REMOVE_PENDING_PROOF_GEOS=${details.removeColorPendingProofGeos.join(",")}`,
  );
  console.log(
    `WIKI_TRUTH_PRIMARY_LAW_BLOCKERS=${details.primaryLawBlockersRowCount}/${expectedPrimaryLawBlockersTotal}`,
  );
  console.log(
    `WIKI_TRUTH_PRIMARY_LAW_BLOCKERS_NON_MUTATING=${details.primaryLawBlockersNonMutatingAttr === "1" && primaryLawBlockersArtifact.nonMutating === true ? 1 : 0}`,
  );
  console.log(
    `WIKI_TRUTH_PRIMARY_LAW_BLOCKER_GEOS=${details.primaryLawBlockerGeos.join(",")}`,
  );
  console.log(
    `WIKI_TRUTH_PRIMARY_LAW_BLOCKER_NEGATIVE_SEARCHES=${Object.entries(details.primaryLawBlockerNegativeSearches)
      .map(([geo, searches]) => `${geo}:${searches}`)
      .join(";")}`,
  );
  console.log(
    `WIKI_TRUTH_PRIMARY_LAW_BLOCKER_BOUNDARIES=${Object.entries(details.primaryLawBlockerBoundaries)
      .map(([geo, boundary]) => `${geo}:${boundary}`)
      .join(";")}`,
  );
  console.log(
    `WIKI_TRUTH_PRIMARY_LAW_BLOCKER_COLLECTOR_HAS_CANNABIS=${Object.entries(details.primaryLawBlockerCollectorHasCannabisPages)
      .map(([geo, hasCannabis]) => `${geo}:${hasCannabis}`)
      .join(";")}`,
  );
  console.log(
    `WIKI_TRUTH_PRIMARY_LAW_BLOCKER_COLLECTOR_FETCHED=${Object.entries(details.primaryLawBlockerCollectorFetchedCandidates)
      .map(([geo, fetched]) => `${geo}:${fetched}`)
      .join(";")}`,
  );
  console.log(
    `WIKI_TRUTH_PRIMARY_LAW_BLOCKER_VISUAL_SCREENSHOTS=${Object.entries(details.primaryLawBlockerVisualScreenshots)
      .map(([geo, screenshots]) => `${geo}:${screenshots}`)
      .join(";")}`,
  );
  console.log(
    `WIKI_TRUTH_PRIMARY_LAW_BLOCKER_FRESH_SEARCH_RESULTS=${Object.entries(details.primaryLawBlockerFreshSearchResults)
      .map(([geo, result]) => `${geo}:${result}`)
      .join(";")}`,
  );
  console.log(
    `WIKI_TRUTH_PRIMARY_LAW_BLOCKER_FRESH_SEARCH_COUNTS=${Object.entries(details.primaryLawBlockerFreshSearchQueryCounts)
      .map(
        ([geo, queries]) =>
          `${geo}:queries=${queries},sources=${details.primaryLawBlockerFreshSearchSourceCounts[geo] || 0},direct=${details.primaryLawBlockerFreshSearchDirectFinds[geo] || 0}`,
      )
      .join(";")}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_PLAN=${details.colorApplyPlanRowCount}/${expectedColorApplyPlanTotal}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_PLAN_STATUS=${details.colorApplyPlanStatusAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_PLAN_NON_MUTATING=${details.colorApplyPlanNonMutatingAttr === "1" && colorApplyPlanArtifact.nonMutating === true ? 1 : 0}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_PLAN_REQUIRES_AUTH=${details.colorApplyPlanRequiresAuthorizationAttr === "1" && colorApplyPlanArtifact.requiresExplicitAuthorization === true ? 1 : 0}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_PLAN_APPLIED_ROWS=${details.colorApplyPlanAppliedRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_PLAN_BLOCKED_PRIMARY_LAW_GEOS=${details.colorApplyPlanBlockedPrimaryLawGeos.join(",")}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_GATE=${details.colorApplyGateRowCount}/${expectedColorApplyGateTotal}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_GATE_STATUS=${details.colorApplyGateStatusAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_GATE_NON_MUTATING=${details.colorApplyGateNonMutatingAttr === "1" && colorApplyGateArtifact.nonMutating === true ? 1 : 0}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_GATE_AUTHORIZATION=${details.colorApplyGateAuthorizationAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_GATE_SSOT_WRITE=${details.colorApplyGateSsotWriteAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_GATE_APPLIED_ROWS=${details.colorApplyGateAppliedRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_GATE_BLOCKED_ROWS=${details.colorApplyGateBlockedRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_APPLY_GATE_PRIMARY_LAW_BLOCKERS=${details.colorApplyGatePrimaryLawBlockersAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_REVIEW_DOSSIER=${details.colorReviewDossierRowCount}/${expectedColorReviewDossierTotal}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_REVIEW_DOSSIER_STATUS=${details.colorReviewDossierStatusAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_REVIEW_DOSSIER_NON_MUTATING=${details.colorReviewDossierNonMutatingAttr === "1" && colorReviewDossierArtifact.nonMutating === true ? 1 : 0}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_REVIEW_DOSSIER_APPLIED_ROWS=${details.colorReviewDossierAppliedRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_REVIEW_DOSSIER_READY_PENDING_AUTH=${details.colorReviewDossierReadyPendingAuthorizationAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_REVIEW_DOSSIER_BLOCKED_ROWS=${details.colorReviewDossierBlockedRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_COLOR_REVIEW_DOSSIER_PRIMARY_LAW_BLOCKERS=${details.colorReviewDossierPrimaryLawBlockersAttr}`,
  );
  console.log(
    `WIKI_TRUTH_LEGAL_AXIS_MATRIX_STATUS=${details.legalAxisMatrixStatusAttr}`,
  );
  console.log(
    `WIKI_TRUTH_LEGAL_AXIS_MATRIX_ROWS=${details.legalAxisMatrixRowsTotalAttr}/${details.legalAxisMatrixRowsExpectedAttr}`,
  );
  console.log(
    `WIKI_TRUTH_LEGAL_AXIS_MATRIX_AXES=${details.legalAxisMatrixRequiredAxesAttr}`,
  );
  console.log(
    `WIKI_TRUTH_LEGAL_AXIS_MATRIX_CELLS=${details.legalAxisMatrixCellsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_LEGAL_AXIS_MATRIX_KNOWN_CELLS=${details.legalAxisMatrixKnownCellsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_LEGAL_AXIS_MATRIX_UNKNOWN_CELLS=${details.legalAxisMatrixUnknownCellsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_LEGAL_AXIS_MATRIX_APPLIED_ROWS=${details.legalAxisMatrixAppliedRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_FINAL_RECONCILIATION=${details.finalReconciliationRowsTotalAttr}/${details.finalReconciliationRowsExpectedAttr}`,
  );
  console.log(
    `WIKI_TRUTH_FINAL_RECONCILIATION_COMPLETE=${details.finalReconciliationCompleteAttr}`,
  );
  console.log(
    `WIKI_TRUTH_FINAL_RECONCILIATION_COLORS=RED:${details.finalReconciliationTruthRedAttr},YELLOW:${details.finalReconciliationTruthYellowAttr},GREEN:${details.finalReconciliationTruthGreenAttr},UNKNOWN:${details.finalReconciliationTruthUnknownAttr}`,
  );
  console.log(
    `WIKI_TRUTH_FINAL_RECONCILIATION_NO_MUTATION=${details.finalReconciliationNoMutationAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_APPLY_PIPELINE=${details.runtimeApplyPipelineRowCount}/${expectedRuntimeApplyExecutionTotal}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_APPLY_DRY_RUN_STATUS=${details.runtimeApplyDryRunStatusAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_APPLY_PREFLIGHT_STATUS=${details.runtimeApplyPreflightStatusAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_APPLY_EXECUTION_STATUS=${details.runtimeApplyExecutionStatusAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_APPLY_APPLIED_ROWS=${details.runtimeApplyAppliedRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_APPLY_WRITTEN_TARGET_FILES=${details.runtimeApplyWrittenTargetFilesAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_APPLY_TARGET_DRIFT_FILES=${details.runtimeApplyTargetDriftFilesAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_APPLY_AUTHORIZATION=${details.runtimeApplyAuthorizationPresentAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_APPLY_SSOT_WRITE=${details.runtimeApplySsotWriteEnabledAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_POST_APPLY_STATUS=${details.runtimePostApplyStatusAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_POST_APPLY_SAFE_ROWS=${details.runtimePostApplySafeRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_POST_APPLY_NO_OP_ROWS=${details.runtimePostApplyNoOpRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_POST_APPLY_BLOCKED_ROWS=${details.runtimePostApplyBlockedRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_POST_APPLY_TRUTH_ALIGNED=${details.runtimePostApplyTruthAlignedAttr}/${details.runtimePostApplyCoverageExpectedAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_POST_APPLY_APPLIED_ROWS=${details.runtimePostApplyAppliedRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_BLOCKER_EXIT_DOSSIER_STATUS=${details.blockerExitStatusAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_BLOCKER_EXIT_DOSSIER_ROWS=${details.blockerExitRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_BLOCKER_EXIT_DOSSIER_EXIT_READY=${details.blockerExitReadyNowAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_BLOCKER_EXIT_DOSSIER_EXCLUDED_SAFE=${details.blockerExitExcludedSafeAttr}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_BLOCKER_EXIT_DOSSIER_APPLIED_ROWS=${details.blockerExitAppliedRowsAttr}`,
  );
  console.log(
    `WIKI_TRUTH_CANNABIS_OFFICIAL_URL_GEOS=${details.cannabisOfficialUrlGeoCount}`,
  );
  console.log(
    `WIKI_TRUTH_RUNTIME_PARITY=${details.buildMeta?.expectedOrigin === BASE_URL ? 1 : 0}`,
  );
  console.log(`WIKI_TRUTH_FRESHNESS_STATUS=${details.freshnessStatus}`);
  console.log(
    `WIKI_TRUTH_REFRESH_BUTTON_PRESENT=${details.freshnessReloadButtonPresent ? 1 : 0}`,
  );
  process.exit(pass ? 0 : 1);
} finally {
  await context.close();
  await browser.close();
  await slot.release();
}
