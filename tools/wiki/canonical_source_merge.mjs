const RECORDED_EMPTY = new Set(["", "NOT_RECORDED", "UNSPECIFIED"]);

function recorded(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return !RECORDED_EMPTY.has(value.trim().toUpperCase());
  return true;
}

function trimmed(value) {
  return String(value ?? "").trim();
}

function firstRecorded(record, aliases) {
  for (const alias of aliases) {
    if (recorded(record?.[alias])) return record[alias];
  }
  return undefined;
}

function normalizedOwner(record) {
  const values = [record?.sourceOwnerGeo, record?.source_owner_geo]
    .filter(recorded)
    .map((value) => trimmed(value).toUpperCase());
  const distinct = [...new Set(values)];
  if (distinct.length > 1) {
    throw new Error(`CANONICAL_SOURCE_MERGE_OWNER_ALIAS_CONFLICT=${distinct.join("|")}`);
  }
  return distinct[0] || "";
}

function normalizedApplicability(record) {
  const aliases = [
    record?.appliesToGeos,
    record?.applies_to_geos,
    record?.appliesToGeo,
    record?.applies_to_geo,
  ].filter((value) => value !== undefined && value !== null);
  const values = aliases.map((value) => {
    if (!Array.isArray(value)) throw new Error("CANONICAL_SOURCE_MERGE_APPLICABILITY_ALIAS_INVALID");
    return [...new Set(value.map((geo) => trimmed(geo).toUpperCase()).filter(Boolean))].sort();
  });
  const distinct = [...new Set(values.map((value) => JSON.stringify(value)))];
  if (distinct.length > 1) {
    throw new Error(`CANONICAL_SOURCE_MERGE_APPLICABILITY_ALIAS_CONFLICT=${distinct.join("|")}`);
  }
  return values[0] || [];
}

function sourceScreenshotPaths(record) {
  const paths = [
    record?.currentScreenshotPath,
    record?.current_screenshot_path,
    record?.screenshotPath,
    record?.screenshot_path,
    record?.screenshot,
    record?.historicalScreenshotPath,
    record?.historical_screenshot_path,
    ...(Array.isArray(record?.screenshotPaths) ? record.screenshotPaths : []),
    ...(Array.isArray(record?.screenshot_paths) ? record.screenshot_paths : []),
    ...(Array.isArray(record?.freshScreenshotPaths) ? record.freshScreenshotPaths : []),
    ...(Array.isArray(record?.fresh_screenshot_paths) ? record.fresh_screenshot_paths : []),
    ...(Array.isArray(record?.visualEvidence) ? record.visualEvidence : []),
    ...(Array.isArray(record?.visual_evidence) ? record.visual_evidence : []),
    ...(Array.isArray(record?.exact_fragments)
      ? record.exact_fragments.map((fragment) => fragment?.evidence_crop)
      : []),
  ];
  return [...new Set(paths.map(trimmed).filter(Boolean))];
}

function sourceMetadataScore(record) {
  const owner = normalizedOwner(record);
  const applicability = normalizedApplicability(record);
  const screenshotPaths = sourceScreenshotPaths(record);
  const exactFragment = firstRecorded(record, [
    "fragment",
    "exactFragment",
    "exact_fragment",
    "directFragment",
    "direct_fragment",
  ]);
  return Number(Boolean(owner)) * 16
    + Number(applicability.length > 0) * 16
    + Number(recorded(firstRecorded(record, ["legalBasisForExtension", "legal_basis_for_extension"]))) * 8
    + Number(recorded(firstRecorded(record, ["sourceType", "source_type"]))) * 4
    + Number(recorded(firstRecorded(record, ["officialPublisher", "owner", "sourceAuthority", "source_authority"]))) * 4
    + Number(recorded(firstRecorded(record, ["primaryOrContext", "primary_or_context"]))) * 4
    + Number(recorded(exactFragment)) * 4
    + Number(screenshotPaths.length > 0) * 4
    + Math.min(screenshotPaths.length, 4)
    + Number(record?.screenshotValid === true || record?.screenshot_valid === true) * 2
    + Number(record?.visualOpened === true || record?.visual_opened === true) * 2
    + Number(record?.current !== undefined && record?.current !== null)
    + Number(record?.effective !== undefined && record?.effective !== null);
}

function oneDistinctRecorded(values, errorPrefix) {
  const distinct = [...new Set(values.filter(recorded).map(trimmed))];
  if (distinct.length > 1) throw new Error(`${errorPrefix}=${distinct.join("|")}`);
  return distinct[0] || "";
}

function revalidationIdentity(record, field, fallback) {
  const value = record?.revalidation?.[field] || (fallback ? record?.revalidation?.[fallback] : undefined);
  return recorded(value) ? trimmed(value) : "";
}

export function canonicalSourceRawIdentityScore(record) {
  const fragment = firstRecorded(record, [
    "fragment",
    "exactFragment",
    "exact_fragment",
    "directFragment",
    "direct_fragment",
  ]);
  const revalidation = record?.revalidation && typeof record.revalidation === "object"
    ? record.revalidation
    : null;
  const identityFields = revalidation
    ? [
      revalidation.final_url,
      revalidation.document_sha256,
      revalidation.response_sha256,
      revalidation.relevant_fragment_sha256,
      revalidation.checked_at,
      revalidation.revalidation_state,
      revalidation.access_state,
    ].filter(recorded).length
    : 0;
  return Number(recorded(fragment)) * 16
    + Number(Boolean(revalidation)) * 16
    + identityFields;
}

function preferredMetadata(entries, aliases) {
  for (const { record } of entries) {
    const value = firstRecorded(record, aliases);
    if (recorded(value)) return value;
  }
  return undefined;
}

function preferredReviewFlag(entries, aliases) {
  for (const { record } of entries) {
    const value = firstRecorded(record, aliases);
    if (typeof value === "boolean" || recorded(value)) return value;
  }
  return undefined;
}

/**
 * Coalesces byte-for-byte equal source URLs, or a caller's explicitly supplied
 * comparison key. The selected identity record still owns the raw URL,
 * fragment and complete revalidation object. Metadata is enriched through an
 * explicit allow-list and never across a conflicting document/final-URL
 * identity, so a merge cannot manufacture a combination that never existed in
 * one record.
 */
export function mergeCanonicalSourceRecordsByUrl(records, options = {}) {
  const groups = new Map();
  for (const [index, record] of (Array.isArray(records) ? records : []).entries()) {
    const rawUrl = trimmed(record?.url);
    if (!rawUrl) continue;
    const key = trimmed(options.urlKey?.(rawUrl) || rawUrl);
    const entries = groups.get(key) || [];
    entries.push({ record, index });
    groups.set(key, entries);
  }

  return [...groups.values()].map((group) => {
    const context = trimmed(options.context) || "CANONICAL_SOURCE";
    const ranked = [...group].sort((left, right) => {
      const leftPriority = Number(options.identityPriority?.(left.record, left.index) || 0);
      const rightPriority = Number(options.identityPriority?.(right.record, right.index) || 0);
      return rightPriority - leftPriority
        || sourceMetadataScore(right.record) - sourceMetadataScore(left.record)
        || left.index - right.index;
    });
    const identity = ranked[0].record;
    const url = trimmed(identity?.url);

    const identityDocument = revalidationIdentity(identity, "document_sha256", "response_sha256");
    const identityFinalUrl = revalidationIdentity(identity, "final_url");
    const compatibleGroup = ranked.filter(({ record }) => {
      const document = revalidationIdentity(record, "document_sha256", "response_sha256");
      const finalUrl = revalidationIdentity(record, "final_url");
      const documentCompatible = !document || !identityDocument || document === identityDocument;
      const finalUrlCompatible = !finalUrl || !identityFinalUrl || finalUrl === identityFinalUrl;
      return documentCompatible && finalUrlCompatible;
    });

    const owners = compatibleGroup.map(({ record }) => normalizedOwner(record)).filter(Boolean);
    oneDistinctRecorded(owners, `CANONICAL_SOURCE_MERGE_OWNER_CONFLICT:${context}:${url}`);
    const applicabilityValues = compatibleGroup
      .map(({ record }) => normalizedApplicability(record))
      .filter((value) => value.length > 0);
    oneDistinctRecorded(
      applicabilityValues.map((value) => JSON.stringify(value)),
      `CANONICAL_SOURCE_MERGE_APPLICABILITY_CONFLICT:${context}:${url}`,
    );

    const merged = { ...identity, url };
    const assign = (key, aliases) => {
      const value = preferredMetadata(compatibleGroup, aliases);
      if (recorded(value)) merged[key] = value;
    };
    // A human-readable title is presentation metadata. Every legal/evidence
    // field (publisher, source type, scope, annotation, confidence, current /
    // effective state) remains owned by the one selected raw record. Filling
    // any of those fields from a sibling record would create a source packet
    // that never existed and invalidate an exact C2/C3 attestation.
    assign("title", ["title"]);
    // Owner and applicability participate in the source-review signal
    // identity. Validate every compatible duplicate above, but never fill a
    // missing identity field from a different record: doing so would create a
    // synthetic V2 signal at the old source-check time. A later canonical
    // revalidation may record that enrichment as a genuine new attempt.
    const identityOwner = normalizedOwner(identity);
    const identityApplicability = normalizedApplicability(identity);
    if (identityOwner) merged.sourceOwnerGeo = identityOwner;
    if (identityApplicability.length > 0) merged.appliesToGeos = identityApplicability;

    for (const [key, aliases] of [
      ["visualOpened", ["visualOpened", "visual_opened"]],
      ["screenshotValid", ["screenshotValid", "screenshot_valid"]],
      ["officialOwnerVisible", ["officialOwnerVisible", "official_owner_visible"]],
      ["officialDomainVisible", ["officialDomainVisible", "official_domain_visible"]],
      ["cannabisFragmentVisible", ["cannabisFragmentVisible", "cannabis_fragment_visible"]],
      ["effectiveRuleVisible", ["effectiveRuleVisible", "effective_rule_visible"]],
    ]) {
      const value = preferredReviewFlag(compatibleGroup, aliases);
      if (value !== undefined) merged[key] = value;
    }

    const screenshotPaths = [...new Set(compatibleGroup.flatMap(({ record }) => sourceScreenshotPaths(record)))];
    if (screenshotPaths.length > 0) {
      const identityPaths = sourceScreenshotPaths(identity);
      merged.screenshotPath = identityPaths[0] || screenshotPaths[0];
      merged.freshScreenshotPaths = screenshotPaths;
      merged.screenshotAvailable = true;
    } else {
      const screenshotAvailable = preferredReviewFlag(compatibleGroup, ["screenshotAvailable", "screenshot_available"]);
      if (screenshotAvailable !== undefined) merged.screenshotAvailable = screenshotAvailable;
    }

    return merged;
  });
}
