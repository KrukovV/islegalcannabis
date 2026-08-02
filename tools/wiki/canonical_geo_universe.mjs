function normalizeGeo(value) {
  return String(typeof value === "string" ? value : value?.geo || "").trim();
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
