import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const REVIEWS = path.join(ROOT, "data/reviews");
const EXPECTED_COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);

const INPUTS = {
  baseline: "wiki-truth-307-final-reconciliation-baseline.json",
  sourceRechecks: "wiki-truth-307-final-source-rechecks.json",
  truth: "wiki-truth-307-truth-audit-report.json",
  matrix: "wiki-truth-cannabis-law-matrix-307.json",
  overlay: "wiki-truth-307-three-color-overlay.json",
  legalAxis: "wiki-truth-307-legal-knowledge-axis-matrix.json",
  proposals: "wiki-truth-307-color-proposals.json",
  applyPlan: "wiki-truth-307-color-apply-plan.json",
  reviewDossier: "wiki-truth-307-color-review-dossier.json",
  acceptance: "wiki-truth-307-acceptance-audit.json",
  runtimeTruthConflicts: "wiki-truth-307-runtime-truth-conflict-audit.json",
};

const OUT_JSON = path.join(
  REVIEWS,
  "wiki-truth-307-final-reconciliation.json",
);
const OUT_MD = path.join(
  REVIEWS,
  "wiki-truth-307-final-reconciliation.md",
);

function readJson(name, fallback = {}) {
  const filePath = path.join(REVIEWS, name);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function readCsvRows(fileName) {
  const filePath = path.join(REVIEWS, fileName);
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsvLine(lines[0] || "").map((value) =>
    value.replace(/^"|"$/g, ""),
  );
  if (header.length === 0) return [];
  return lines
    .slice(1)
    .map((line) => {
      const columns = parseCsvLine(line).map((value) => value.replace(/^"|"$/g, ""));
      const row = {};
      header.forEach((key, index) => {
        row[key] = columns[index] ?? "";
      });
      return row;
    });
}

function readGeoSetFromCsv(fileName, geoField = "geo") {
  const rows = readCsvRows(fileName);
  const set = new Set();
  for (const row of rows) {
    const geo = String(row?.[geoField] || "").trim().toUpperCase();
    if (geo) set.add(geo);
  }
  return set;
}

function isScopeMixingText(reason = "", rule = "") {
  const text = `${String(reason || "").toUpperCase()} ${String(rule || "").toUpperCase()}`;
  return /DISPUTED|CLAIMANT|ADMINISTER|SCOPE|FEDERAL|NATIONAL|STATE|COMPONENT|UNCLAIMED/.test(
    text,
  );
}

function classifyColorVerdict(row, diagnostics) {
  const geo = String(row.geo || "").toUpperCase();
  if (diagnostics.temporal.has(geo)) return "TEMPORAL_CONFLICT";
  if (diagnostics.insufficient.has(geo)) return "INSUFFICIENT_EVIDENCE";
  if (diagnostics.axisOnly.has(geo)) return "AXIS_MISMATCH_COLOR_MATCH";
  if (diagnostics.scopeMode.has(geo)) {
    return isScopeMixingText(row.truthReason, row.truthRuleId)
      ? "SCOPE_MIXING"
      : "MODE_MIXING";
  }
  if (row.previousColor === row.truthColor) {
    return "AXIS_MISMATCH_COLOR_MATCH";
  }
  return "MAP_WRONG_TRUTH_RIGHT";
}

function asArray(payload, keys = ["rows"]) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function indexByGeo(rows) {
  return new Map(
    rows
      .filter((row) => row?.geo)
      .map((row) => [String(row.geo).toUpperCase(), row]),
  );
}

function countBy(rows, selector) {
  return rows.reduce((counts, row) => {
    const key = String(selector(row) || "UNKNOWN");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function normalizeLinks(row) {
  const buckets = [
    ...(Array.isArray(row?.directOfficialCannabisLawLinks)
      ? row.directOfficialCannabisLawLinks
      : []),
    ...(Array.isArray(row?.officialContextLinks) ? row.officialContextLinks : []),
    ...(Array.isArray(row?.supplementalOfficialLinks)
      ? row.supplementalOfficialLinks
      : []),
    ...(Array.isArray(row?.freshSecondPassOfficialLinks)
      ? row.freshSecondPassOfficialLinks
      : []),
    ...(Array.isArray(row?.latestColorReaudit?.freshOfficialSources)
      ? row.latestColorReaudit.freshOfficialSources
      : []),
  ];
  const seen = new Set();
  return buckets
    .map((link) => ({
      title: String(link?.title || link?.url || "Official source"),
      url: String(link?.url || ""),
      sourceKind: String(link?.sourceKind || link?.source_kind || ""),
      verification: String(link?.verification || ""),
      visualReview: String(
        link?.visualReview ||
          link?.freshVisualAnalysisRu ||
          link?.note ||
          "",
      ),
    }))
    .filter((link) => {
      if (!link.url || seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    });
}

function sourceRowsByUrl(payload) {
  const queue = asArray(payload?.queue, ["queue", "items", "rows"]);
  const browser = asArray(payload?.browser, ["results", "items", "rows"]);
  const http = asArray(payload?.http, ["results", "items", "rows"]);
  const browserByUrl = new Map(
    browser
      .filter((row) => row?.url)
      .map((row) => [String(row.url), row]),
  );
  const httpByUrl = new Map(
    http
      .filter((row) => row?.url)
      .map((row) => [String(row.url), row]),
  );
  return {
    queue,
    browser,
    http,
    browserByUrl,
    httpByUrl,
  };
}

function sourceRecheckForGeo(geo, sourceLog) {
  const queueRows = sourceLog.queue.filter(
    (row) => String(row?.geo || "").toUpperCase() === geo,
  );
  const attempts = queueRows.map((item) => {
    const url = String(item?.url || "");
    const browser = sourceLog.browserByUrl.get(url) || null;
    const http = sourceLog.httpByUrl.get(url) || null;
    const browserRendered =
      browser?.rendered === true ||
      browser?.pdf === true ||
      browser?.ok === true ||
      (
        browser?.navigation === "OK" &&
        (
          browser?.readyState === "complete" ||
          String(browser?.contentType || "").includes("pdf")
        )
      ) ||
      /RENDERED|PDF|SUCCESS|OK/.test(
        String(browser?.status || browser?.result || "").toUpperCase(),
      );
    const httpStatus = Number(
      http?.status || http?.httpStatus || http?.statusCode || 0,
    );
    return {
      url,
      browserStatus: String(
        browser?.status || browser?.result || browser?.error || "NOT_ATTEMPTED",
      ),
      browserRendered,
      httpStatus,
      httpMime: String(http?.mime || http?.contentType || ""),
      httpSha256: String(http?.sha256 || ""),
      retrieval:
        browserRendered
          ? "BROWSER_RENDERED"
          : httpStatus >= 200 && httpStatus < 300
            ? "HTTP_SUCCESS"
            : "BLOCKED_OR_UNAVAILABLE",
    };
  });
  return {
    selectedForFreshRecheck: queueRows.length > 0,
    attempts,
    successfulAttempts: attempts.filter(
      (row) => row.retrieval !== "BLOCKED_OR_UNAVAILABLE",
    ).length,
    caveat:
      "Availability does not establish legality; saved manual Primary Law review remains the legal evidence.",
  };
}

function resolveProtectedPath(item) {
  const raw = String(item?.path || "");
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

function fileSha256(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function protectedHashProof(baseline) {
  return asArray(baseline?.protectedHashProof, ["protectedHashProof"]).map(
    (item) => {
      const filePath = resolveProtectedPath(item);
      const currentSha256 = fileSha256(filePath);
      const baselineSha256 = String(item?.sha256 || "");
      return {
        path: String(item?.path || ""),
        exists: fs.existsSync(filePath),
        baselineSha256,
        currentSha256,
        unchanged:
          Boolean(baselineSha256) && baselineSha256 === currentSha256,
      };
    },
  );
}

function falseClass(previousColor, truthColor) {
  if (previousColor === truthColor) return null;
  return `FALSE_${previousColor}`;
}

function markdown(report) {
  const lines = [
    "# Truth-First Final Reconciliation",
    "",
    `Generated: ${report.generatedAt}`,
    `Rows: ${report.rowsTotal}/${report.rowsExpected}`,
    `Truth colors: ${JSON.stringify(report.counts.truthColors)}`,
    `Changes: ${report.changes.length}`,
    `Cross-layer conflicts: ${report.acceptance.crossLayerConflictRows.length}`,
    `Unproven GREEN: ${report.acceptance.unprovenGreenRows.length}`,
    `UNKNOWN: ${report.unknownRows.length}`,
    `Protected files unchanged: ${report.noMutationProof.unchanged}`,
    "",
    "## Rule Engine corrections",
    "",
    ...report.ruleEngineCorrections.map((item) => `- ${item}`),
    "",
    "## False-color corrections",
    "",
    ...Object.entries(report.falseColorRows).map(
      ([key, rows]) =>
        `- ${key}: ${rows.length}${rows.length ? ` (${rows.map((row) => row.geo).join(", ")})` : ""}`,
    ),
    "",
    "## Verdict corrections",
    ...Object.entries(report.counts.colorVerdicts).map(
      ([key, value]) => `- ${key}: ${value}`,
    ),
    "",
    "## Changed colors",
    "",
    ...(report.changes.length
      ? report.changes.map(
          (row) =>
            `- ${row.geo} ${row.previousColor} -> ${row.truthColor}; ${row.verdict}; ${row.truthRuleId}; ${row.truthReason}; ${row.primaryLawUrl || "NO_URL"}`,
        )
      : ["- None"]),
    "",
    "## UNKNOWN / uncolored",
    "",
    ...(report.unknownRows.length
      ? report.unknownRows.map(
          (row) =>
            `- ${row.geo}: ${row.truthReason}; sourceCoverage=${row.effectiveSourceCoverage}`,
        )
      : ["- None"]),
    "",
    "## Acceptance",
    "",
    ...Object.entries(report.acceptance.flags).map(
      ([key, value]) => `- ${key}: ${value}`,
    ),
    "",
    "This report is audit-only. It does not mutate SSOT, map, production, or runtime.",
    "",
  ];
  return lines.join("\n");
}

function main() {
  const baseline = readJson(INPUTS.baseline);
  const sourceRechecks = readJson(INPUTS.sourceRechecks);
  const truth = readJson(INPUTS.truth);
  const matrix = readJson(INPUTS.matrix);
  const overlay = readJson(INPUTS.overlay);
  const legalAxis = readJson(INPUTS.legalAxis);
  const proposals = readJson(INPUTS.proposals);
  const applyPlan = readJson(INPUTS.applyPlan);
  const reviewDossier = readJson(INPUTS.reviewDossier);
  const acceptance = readJson(INPUTS.acceptance);
  const runtimeTruthConflicts = readJson(INPUTS.runtimeTruthConflicts);
  const diagnostics = {
    insufficient: readGeoSetFromCsv("insufficient_evidence.csv"),
    temporal: readGeoSetFromCsv("temporal_conflicts.csv"),
    scopeMode: readGeoSetFromCsv("scope_and_mode_mixing_errors.csv"),
    axisOnly: readGeoSetFromCsv("axis_only_conflicts.csv"),
  };

  const truthRows = asArray(truth);
  const matrixByGeo = indexByGeo(asArray(matrix));
  const baselineByGeo = indexByGeo(asArray(baseline));
  const overlayByGeo = indexByGeo(asArray(overlay));
  const legalAxisByGeo = indexByGeo(asArray(legalAxis));
  const proposalByGeo = indexByGeo(asArray(proposals, ["proposals", "rows"]));
  const applyByGeo = indexByGeo(asArray(applyPlan));
  const dossierByGeo = indexByGeo(asArray(reviewDossier));
  const acceptanceByGeo = indexByGeo(asArray(acceptance));
  const runtimeConflictByGeo = indexByGeo(asArray(runtimeTruthConflicts));
  const sourceLog = sourceRowsByUrl(sourceRechecks);

  const rows = truthRows.map((truthRow) => {
    const geo = String(truthRow.geo || "").toUpperCase();
    const matrixRow = matrixByGeo.get(geo) || {};
    const baselineRow = baselineByGeo.get(geo) || {};
    const overlayRow = overlayByGeo.get(geo) || {};
    const legalAxisRow = legalAxisByGeo.get(geo) || {};
    const proposalRow = proposalByGeo.get(geo) || {};
    const applyRow = applyByGeo.get(geo) || {};
    const dossierRow = dossierByGeo.get(geo) || {};
    const acceptanceRow = acceptanceByGeo.get(geo) || {};
    const runtimeConflictRow = runtimeConflictByGeo.get(geo) || {};
    const truthColor = String(truthRow?.truth?.color || "UNKNOWN");
    const previousColor = String(baselineRow?.truthColor || "UNKNOWN");
    const officialSources = normalizeLinks(matrixRow);
    const truthRuleId = String(
      truthRow?.truth?.ruleId || truthRow?.truth?.source || "NO_RULE",
    );
    const patientFacts = truthRow?.truth?.facts || {};
    const currentMapColor = String(
      truthRow?.diagnostics?.color?.current?.color || "UNKNOWN",
    );
    const greenProof =
      truthColor !== "GREEN" ||
      truthRuleId === "OFFICIAL_STATUS_RECREATIONAL_LEGAL" ||
      (
        patientFacts.patient === true &&
        patientFacts.lawfulRoute === true &&
        patientFacts.supply === true &&
        patientFacts.operational === true
      );
    const layerColors = {
      detailedReview: String(
        truthRow?.diagnostics?.color?.truth?.color || "MISSING",
      ),
      truthMatrix: truthColor,
      colorEngine: String(
        truthRow?.diagnostics?.color?.truth?.color || "MISSING",
      ),
      overlay: String(overlayRow?.truthColor || "MISSING"),
      legalKnowledgeAxis: String(legalAxisRow?.truthColor || "MISSING"),
      proposal: String(proposalRow?.proposedTruthColor || currentMapColor),
      applyPlan: String(applyRow?.proposedTruthColor || currentMapColor),
      reviewDossier: String(
        dossierRow?.proposedTruthColor || currentMapColor,
      ),
      ui: truthColor,
    };
    const layerConflict = Object.values(layerColors).some(
      (color) => color !== truthColor,
    );
    const sourceRecheck = sourceRecheckForGeo(geo, sourceLog);
    const verdict = classifyColorVerdict(
      {
        geo,
        previousColor,
        truthColor,
        truthRuleId,
        truthReason: String(truthRow?.truth?.reason || ""),
      },
      diagnostics,
    );
    return {
      geo,
      territory: String(truthRow.territory || matrixRow.territory || ""),
      previousColor,
      truthColor,
      falseClass: falseClass(previousColor, truthColor),
      changed: previousColor !== truthColor,
      truthStatus: truthRuleId,
      truthRuleId,
      truthReason: String(truthRow?.truth?.reason || ""),
      patientAccessFacts: patientFacts,
      greenProof,
      layerColors,
      layerConflict,
      verdict,
      primaryLaw: {
        sourceCoverage: String(truthRow.sourceCoverage || "MISSING"),
        effectiveSourceCoverage: String(
          truthRow.effectiveSourceCoverage || "MISSING",
        ),
        officialSources,
        primaryLawUrl: officialSources[0]?.url || "",
      },
      legalInterpretation: truthRow.legalInterpretation || {},
      wikipedia: {
        status: String(
          truthRow?.diagnostics?.wiki?.extended?.status ||
            truthRow?.diagnostics?.wiki?.status ||
            "WIKIPEDIA_MISSING",
        ),
        reason: String(
          truthRow?.diagnostics?.wiki?.extended?.whatIsWrong ||
            truthRow?.diagnostics?.wiki?.reason ||
            "",
        ),
        page: String(truthRow?.wikipedia?.wikiPage || ""),
      },
      ssot: {
        status: String(truthRow?.diagnostics?.ssot?.status || "UNKNOWN"),
        project: truthRow.project || {},
        mutationApplied: false,
      },
      currentMapSnapshot: truthRow?.diagnostics?.color?.current || {},
      runtimeSnapshot: runtimeConflictRow.geo
        ? {
            color: runtimeConflictRow.currentRuntimeColor || "UNKNOWN",
            relation: "DOCUMENTED_RUNTIME_DELTA_NOT_TRUTH_AUTHORITY",
            mutationAllowed: false,
          }
        : {
            color: previousColor,
            relation:
              previousColor === truthColor
                ? "MATCH"
                : "CURRENT_RUNTIME_OR_MAP_DELTA_TRACKED_BY_PROPOSAL",
            mutationAllowed: false,
          },
      sourceRecheck,
      pipeline: {
        proposalAction: String(proposalRow?.proposalAction || "NO_CHANGE"),
        applyDisposition: String(applyRow?.applyDisposition || "NO_CHANGE"),
        reviewDecision: String(dossierRow?.reviewDecision || "NO_CHANGE"),
        acceptanceStatus: String(acceptanceRow?.status || "UNKNOWN"),
      },
    };
  });

  const changes = rows
    .filter((row) => row.changed)
    .map((row) => ({
      geo: row.geo,
      territory: row.territory,
      verdict: row.verdict,
      previousColor: row.previousColor,
      truthColor: row.truthColor,
      falseClass: row.falseClass,
      truthRuleId: row.truthRuleId,
      truthReason: row.truthReason,
      primaryLawUrl: row.primaryLaw.primaryLawUrl,
      primaryLaw: {
        primaryLawUrl: row.primaryLaw.primaryLawUrl,
      },
    }));
  const falseColorRows = {
    FALSE_GREEN: changes.filter((row) => row.falseClass === "FALSE_GREEN"),
    FALSE_YELLOW: changes.filter((row) => row.falseClass === "FALSE_YELLOW"),
    FALSE_RED: changes.filter((row) => row.falseClass === "FALSE_RED"),
    FALSE_UNKNOWN: changes.filter((row) => row.falseClass === "FALSE_UNKNOWN"),
  };
  const falseVerdictRows = {
    MAP_WRONG_TRUTH_RIGHT: changes.filter(
      (row) => row.verdict === "MAP_WRONG_TRUTH_RIGHT",
    ),
    MAP_RIGHT_TRUTH_WRONG: changes.filter(
      (row) => row.verdict === "MAP_RIGHT_TRUTH_WRONG",
    ),
    BOTH_WRONG: changes.filter((row) => row.verdict === "BOTH_WRONG"),
    AXIS_MISMATCH_COLOR_MATCH: changes.filter(
      (row) => row.verdict === "AXIS_MISMATCH_COLOR_MATCH",
    ),
    INSUFFICIENT_EVIDENCE: changes.filter(
      (row) => row.verdict === "INSUFFICIENT_EVIDENCE",
    ),
    TEMPORAL_CONFLICT: changes.filter(
      (row) => row.verdict === "TEMPORAL_CONFLICT",
    ),
    SCOPE_MIXING: changes.filter((row) => row.verdict === "SCOPE_MIXING"),
    MODE_MIXING: changes.filter((row) => row.verdict === "MODE_MIXING"),
  };
  const unknownRows = rows.filter((row) => row.truthColor === "UNKNOWN");
  const hashProof = protectedHashProof(baseline);
  const crossLayerConflictRows = rows
    .filter((row) => row.layerConflict)
    .map((row) => row.geo);
  const unprovenGreenRows = rows
    .filter((row) => row.truthColor === "GREEN" && !row.greenProof)
    .map((row) => row.geo);
  const coloredWithoutOfficialEvidence = rows
    .filter(
      (row) =>
        row.truthColor !== "UNKNOWN" &&
        row.primaryLaw.officialSources.length === 0,
    )
    .map((row) => row.geo);
  const invalidColorRows = rows
    .filter((row) => !EXPECTED_COLORS.has(row.truthColor))
    .map((row) => row.geo);
  const duplicateGeos = rows
    .map((row) => row.geo)
    .filter((geo, index, all) => all.indexOf(geo) !== index);
  const pageModelSource = fs.readFileSync(
    path.join(ROOT, "apps/web/src/lib/wikiTruthPageModel.ts"),
    "utf8",
  );
  const pageSource = fs.readFileSync(
    path.join(ROOT, "apps/web/src/app/wiki-truth/page.tsx"),
    "utf8",
  );
  const staleUiReads = [
    pageModelSource.includes("wiki_truth_second_pass"),
    pageSource.includes("CompletionGapDossier"),
    /166(?:-row| color proposals)/.test(
      fs.readFileSync(
        path.join(ROOT, "apps/web/src/app/wiki-truth/CannabisLawColorReviewDossier.tsx"),
        "utf8",
      ) +
        fs.readFileSync(
          path.join(ROOT, "apps/web/src/app/wiki-truth/CannabisLawColorApplyPlan.tsx"),
          "utf8",
        ) +
        fs.readFileSync(
          path.join(ROOT, "apps/web/src/app/wiki-truth/CannabisLawColorApplyGate.tsx"),
          "utf8",
        ),
    ),
  ].some(Boolean);

  const flags = {
    rows307Reconciled:
      rows.length === Number(truth.rowsExpected || rows.length) &&
      duplicateGeos.length === 0,
    oneTruthColorPerGeo:
      invalidColorRows.length === 0 && duplicateGeos.length === 0,
    allCurrentLayersAgree: crossLayerConflictRows.length === 0,
    allGreenOperationallyProven: unprovenGreenRows.length === 0,
    everyColoredGeoHasOfficialEvidence:
      coloredWithoutOfficialEvidence.length === 0,
    unknownRowsUncolored: unknownRows.every(
      (row) => row.truthColor === "UNKNOWN",
    ),
    noLegacyUiReads: !staleUiReads,
    acceptanceArtifactComplete: acceptance.complete === true,
    ssotMapProductionRuntimeUnchanged:
      hashProof.length > 0 && hashProof.every((row) => row.unchanged),
  };
  const complete = Object.values(flags).every(Boolean);
  const runtimeSnapshotDeltaRows = rows
    .filter((row) => row.runtimeSnapshot.relation !== "MATCH")
    .map((row) => ({
      geo: row.geo,
      runtimeColor: row.runtimeSnapshot.color,
      truthColor: row.truthColor,
      relation: row.runtimeSnapshot.relation,
    }));
  const matrixCounts = matrix.counts || {};
  const freshSelectedGeos = new Set(
    sourceLog.queue
      .map((row) => String(row?.geo || "").toUpperCase())
      .filter(Boolean),
  );
  const freshRenderedGeos = new Set(
    rows
      .filter((row) =>
        row.sourceRecheck.attempts.some((attempt) => attempt.browserRendered),
      )
      .map((row) => row.geo),
  );

  const output = {
    generatedAt: new Date().toISOString(),
    reportVersion: "2.0.0-final-reconciliation",
    deterministicColorFunction:
      "deriveOfficialTruthColor(Primary Law applicability + independent legal facts)",
    nonMutating: true,
    localOnly: true,
    complete,
    rowsTotal: rows.length,
    rowsExpected: Number(truth.rowsExpected || rows.length),
    inputs: Object.fromEntries(
      Object.entries(INPUTS).map(([key, value]) => [
        key,
        `data/reviews/${value}`,
      ]),
    ),
    ruleEngineCorrections: [
      "Bare REGULATED/programme no longer proves operational patient access.",
      "GREEN patient access requires patient + lawful route + dispensing/import + operational system.",
      "Production/cultivation/research/export require a positive lawful authorization and never imply patient access.",
      "Bill/proposal/draft/repealed/historical no longer create YELLOW; enacted-but-not-operational remains YELLOW.",
      "Generic DRUG/MEDICAL/ACCESS wording no longer creates YELLOW.",
      "International convention/INCB identification no longer makes context law locally applicable.",
      "Combined or component-divergent GEOs remain UNKNOWN without one unitary applicable regime.",
      "RED from no-patient evidence requires a proved recreational prohibition.",
    ],
    counts: {
      truthColors: countBy(rows, (row) => row.truthColor),
      falseClasses: {
        FALSE_GREEN: 0,
        FALSE_YELLOW: 0,
        FALSE_RED: 0,
        FALSE_UNKNOWN: 0,
        ...countBy(changes, (row) => row.falseClass),
      },
      colorVerdicts: {
        MAP_WRONG_TRUTH_RIGHT: 0,
        MAP_RIGHT_TRUTH_WRONG: 0,
        BOTH_WRONG: 0,
        AXIS_MISMATCH_COLOR_MATCH: 0,
        INSUFFICIENT_EVIDENCE: 0,
        TEMPORAL_CONFLICT: 0,
        SCOPE_MIXING: 0,
        MODE_MIXING: 0,
        ...countBy(changes, (row) => row.verdict),
      },
      wikiAudit: countBy(rows, (row) => row.wikipedia.status),
      ssotAudit: countBy(rows, (row) => row.ssot.status),
      sourceCoverage: countBy(
        rows,
        (row) => row.primaryLaw.effectiveSourceCoverage,
      ),
      freshSourceRecheck: {
        selectedGeos: freshSelectedGeos.size,
        browserRenderedGeos: freshRenderedGeos.size,
        browserAttempts: sourceLog.browser.length,
        httpAttempts: sourceLog.http.length,
      },
    },
    changes,
    falseColorRows,
    falseVerdictRows,
    unknownRows: unknownRows.map((row) => ({
      geo: row.geo,
      territory: row.territory,
      truthReason: row.truthReason,
      truthRuleId: row.truthRuleId,
      effectiveSourceCoverage: row.primaryLaw.effectiveSourceCoverage,
      officialSources: row.primaryLaw.officialSources,
    })),
    acceptance: {
      complete,
      flags,
      crossLayerConflictRows,
      unprovenGreenRows,
      coloredWithoutOfficialEvidence,
      invalidColorRows,
      duplicateGeos,
      runtimeSnapshotDeltaRows,
      upstreamAcceptanceComplete: acceptance.complete === true,
    },
    noMutationProof: {
      unchanged:
        hashProof.length > 0 && hashProof.every((row) => row.unchanged),
      protectedHashProof: hashProof,
      appliedRows: 0,
      ssotMutationAttempted: false,
      mapMutationAttempted: false,
      productionTouched: false,
      runtimeMutationAttempted: false,
    },
    progress: {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      total_geo_count: rows.length,
      processed_geo_count: rows.length,
      working_search_artifact_count: sourceLog.queue.length,
      working_review_artifact_count: rows.length,
      fresh_search_count: freshSelectedGeos.size,
      fresh_visual_review_count: freshRenderedGeos.size,
      screenshot_count: Number(matrixCounts.manualVisualReviewComplete || 0),
      baseline_screenshot_count: Number(
        matrixCounts.manualVisualReviewComplete || 0,
      ),
      canonical_evidence_record_count: rows.filter(
        (row) => row.primaryLaw.officialSources.length > 0,
      ).length,
      direct_evidence_count: Number(
        matrixCounts.visuallyVerifiedOfficialCannabisLaw || 0,
      ),
      composite_evidence_count: rows.filter(
        (row) =>
          row.primaryLaw.effectiveSourceCoverage ===
          "COMPOSITE_APPLICABLE_PRIMARY_LAW",
      ).length,
      context_only_count: rows.filter(
        (row) =>
          row.primaryLaw.effectiveSourceCoverage === "OFFICIAL_CONTEXT_ONLY",
      ).length,
      negative_result_count: Number(
        matrixCounts.visuallyReviewedNoDirectPageFound || 0,
      ),
      non_cannabis_rejected_count: 0,
      confirmed_match_count: rows.filter((row) => !row.changed).length,
      confirmed_mismatch_count: changes.length,
      partial_match_count: crossLayerConflictRows.length,
      insufficient_evidence_count: unknownRows.length,
      project_status_missing_count: Number(matrixCounts.noProjectStatus || 0),
      source_conflict_count: crossLayerConflictRows.length,
      proposed_status_changes: Number(proposals.proposalsTotal || changes.length),
      proposed_color_changes: changes.length,
      status_data_changed: false,
      map_colors_changed: false,
      production_touched: false,
      goal_achieved: complete,
      acceptance_flags: flags,
      artifacts: {
        finalReconciliation:
          "data/reviews/wiki-truth-307-final-reconciliation.json",
        finalReport: "data/reviews/wiki-truth-307-final-reconciliation.md",
        sourceRechecks:
          "data/reviews/wiki-truth-307-final-source-rechecks.json",
        baseline:
          "data/reviews/wiki-truth-307-final-reconciliation-baseline.json",
      },
    },
    rows,
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, markdown(output));
  console.log(
    `FINAL_RECONCILIATION rows=${output.rowsTotal}/${output.rowsExpected} colors=${JSON.stringify(output.counts.truthColors)} changes=${changes.length} conflicts=${crossLayerConflictRows.length} unprovenGreen=${unprovenGreenRows.length} unknown=${unknownRows.length} complete=${complete}`,
  );
}

main();
