function normalizeGeo(value) {
  return String(typeof value === "string" ? value : value?.geo || "").trim();
}

function geoTerminalSegment(geo) {
  return normalizeGeo(geo).split("-").at(-1);
}

function collectGeoDiagnostics(values, kind) {
  const counts = new Map();
  const invalid = [];

  for (const value of Array.isArray(values) ? values : []) {
    const geo = normalizeGeo(value);
    if (!geo) {
      invalid.push(value);
      continue;
    }
    counts.set(geo, (counts.get(geo) || 0) + 1);
  }

  return {
    geos: [...counts.keys()],
    duplicates: [...counts]
      .filter(([, count]) => count > 1)
      .map(([geo, count]) => ({ geo, count })),
    invalid,
    kind,
  };
}

export function auditCanonicalGeoUniverse({ canonicalGeos, ledgerRows, expectedCount }) {
  const canonical = collectGeoDiagnostics(canonicalGeos, "canonical");
  const ledger = collectGeoDiagnostics(ledgerRows, "ledger");
  const canonicalSet = new Set(canonical.geos);
  const ledgerSet = new Set(ledger.geos);
  const extras = ledger.geos.filter((geo) => !canonicalSet.has(geo));
  const missing = canonical.geos.filter((geo) => !ledgerSet.has(geo));
  const expectedCountMatches = Number.isInteger(expectedCount)
    ? canonical.geos.length === expectedCount
    : true;

  return {
    canonicalCount: canonical.geos.length,
    ledgerCount: ledger.geos.length,
    expectedCount: Number.isInteger(expectedCount) ? expectedCount : null,
    expectedCountMatches,
    canonicalDuplicates: canonical.duplicates,
    ledgerDuplicates: ledger.duplicates,
    invalidCanonicalEntries: canonical.invalid.length,
    invalidLedgerRows: ledger.invalid.length,
    extras,
    missing,
    valid:
      expectedCountMatches &&
      canonical.duplicates.length === 0 &&
      ledger.duplicates.length === 0 &&
      canonical.invalid.length === 0 &&
      ledger.invalid.length === 0 &&
      extras.length === 0 &&
      missing.length === 0,
  };
}

export function assertCanonicalGeoUniverse(input) {
  const result = auditCanonicalGeoUniverse(input);
  if (!result.valid) {
    throw new Error(
      `CANONICAL_GEO_UNIVERSE_INVALID canonical=${result.canonicalCount} ledger=${result.ledgerCount} expected=${result.expectedCount} canonicalDuplicates=${result.canonicalDuplicates.map((entry) => entry.geo).join(",")} ledgerDuplicates=${result.ledgerDuplicates.map((entry) => entry.geo).join(",")} extras=${result.extras.join(",")} missing=${result.missing.join(",")} invalidCanonical=${result.invalidCanonicalEntries} invalidLedger=${result.invalidLedgerRows}`,
    );
  }
  return result;
}

export function auditLedgerSourceApplicability({ canonicalGeos, ledgerRows }) {
  const canonical = collectGeoDiagnostics(canonicalGeos, "canonical");
  const canonicalSet = new Set(canonical.geos);
  const invalidSourceApplicability = [];
  const sourceRowMismatches = [];
  const multiGeoMissingLegalBasis = [];
  const ownerSuffixCollisions = [];

  for (const row of Array.isArray(ledgerRows) ? ledgerRows : []) {
    const rowGeo = normalizeGeo(row);
    for (const [index, source] of (Array.isArray(row?.verified_sources) ? row.verified_sources : []).entries()) {
      if (!source || typeof source !== "object" || !("applies_to_geo" in source)) continue;

      const appliesTo = source.applies_to_geo;
      const sourceLabel = `${rowGeo}:verified_sources[${index}]`;
      const sourceRole = `${source.primary_or_context || ""} ${source.source_type || ""}`.toUpperCase();
      const isTerritorialLegalEvidence = !sourceRole.includes("CONTEXT");
      if (!Array.isArray(appliesTo)) {
        invalidSourceApplicability.push(`${sourceLabel}:not-array`);
        continue;
      }

      const normalizedAppliesTo = appliesTo.map(normalizeGeo);
      const invalidTargets = normalizedAppliesTo.filter((geo) => !geo || !canonicalSet.has(geo));
      if (invalidTargets.length) {
        invalidSourceApplicability.push(`${sourceLabel}:${invalidTargets.join(",")}`);
      }
      if (new Set(normalizedAppliesTo).size !== normalizedAppliesTo.length) {
        invalidSourceApplicability.push(`${sourceLabel}:duplicate-target`);
      }
      if (isTerritorialLegalEvidence && !normalizedAppliesTo.includes(rowGeo)) {
        sourceRowMismatches.push(sourceLabel);
      }
      const sourceOwnerGeo = normalizeGeo(source.source_owner_geo || source.sourceOwnerGeo);
      if (isTerritorialLegalEvidence && sourceOwnerGeo) {
        for (const targetGeo of normalizedAppliesTo) {
          if (
            sourceOwnerGeo !== targetGeo &&
            geoTerminalSegment(sourceOwnerGeo) === geoTerminalSegment(targetGeo)
          ) {
            ownerSuffixCollisions.push(`${sourceLabel}:${sourceOwnerGeo}->${targetGeo}`);
          }
        }
      }
      if (isTerritorialLegalEvidence && normalizedAppliesTo.length > 1) {
        const basesByGeo = source.legal_basis_for_extension;
        const missingBases = normalizedAppliesTo.filter((geo) => (
          !basesByGeo ||
          typeof basesByGeo !== "object" ||
          Array.isArray(basesByGeo) ||
          typeof basesByGeo[geo] !== "string" ||
          !basesByGeo[geo].trim()
        ));
        if (missingBases.length) {
          multiGeoMissingLegalBasis.push(`${sourceLabel}:${missingBases.join(",")}`);
        }
      }
    }
  }

  return {
    invalidSourceApplicability,
    sourceRowMismatches,
    multiGeoMissingLegalBasis,
    ownerSuffixCollisions,
    valid:
      invalidSourceApplicability.length === 0 &&
      sourceRowMismatches.length === 0 &&
      multiGeoMissingLegalBasis.length === 0 &&
      ownerSuffixCollisions.length === 0,
  };
}

export function assertLedgerSourceApplicability(input) {
  const result = auditLedgerSourceApplicability(input);
  if (!result.valid) {
    throw new Error(
      `LEDGER_SOURCE_APPLICABILITY_INVALID invalidTargets=${result.invalidSourceApplicability.join(",")} rowMismatches=${result.sourceRowMismatches.join(",")} multiGeoMissingLegalBasis=${result.multiGeoMissingLegalBasis.join(",")} ownerSuffixCollisions=${result.ownerSuffixCollisions.join(",")}`,
    );
  }
  return result;
}

export function selectNextCanonicalGeo({ canonicalGeos, completedGeos = [] }) {
  const canonical = collectGeoDiagnostics(canonicalGeos, "canonical");
  const completed = collectGeoDiagnostics(completedGeos, "completed");
  const canonicalSet = new Set(canonical.geos);
  const extras = completed.geos.filter((geo) => !canonicalSet.has(geo));

  if (canonical.duplicates.length || canonical.invalid.length || completed.duplicates.length || completed.invalid.length || extras.length) {
    throw new Error(
      `CANONICAL_GEO_SELECTION_INVALID canonicalDuplicates=${canonical.duplicates.map((entry) => entry.geo).join(",")} completedDuplicates=${completed.duplicates.map((entry) => entry.geo).join(",")} extras=${extras.join(",")} invalidCanonical=${canonical.invalid.length} invalidCompleted=${completed.invalid.length}`,
    );
  }

  const completedSet = new Set(completed.geos);
  return canonical.geos.find((geo) => !completedSet.has(geo)) || null;
}
