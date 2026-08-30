const PENDING_PARTIAL_STATES = new Set(["PENDING_C3_ACCESS_BLOCKED"]);

function text(value) {
  return String(value || "").trim().toUpperCase();
}

/**
 * Classifies discovery progress without treating a retained, unvalidated
 * regulator dataset as a validated registry or as an absent one.
 */
export function resolveStoreDiscoveryState(color, {
  hasValidatedRegistry = false,
  hasRetainablePendingRegistry = false,
  hasCandidate = false,
} = {}) {
  const normalizedColor = text(color) || "UNKNOWN";
  if (normalizedColor === "RED") return "STORES_NOT_LEGAL";
  if (normalizedColor === "UNKNOWN") return "UNKNOWN_LEGALITY";
  if (hasValidatedRegistry) return "LEGAL_OFFICIAL_REGISTRY_FOUND";
  if (hasRetainablePendingRegistry) return "LEGAL_REGISTRY_PARTIAL";
  if (hasCandidate) return "LEGAL_SOURCE_NEEDS_EXTRACTION";
  if (normalizedColor === "YELLOW") return "LEGAL_NO_STOREFRONT_MODEL";
  return "LEGAL_REGISTRY_NOT_FOUND";
}

export function isRetainablePartialRegistrySource(source) {
  return source?.official === true && PENDING_PARTIAL_STATES.has(text(source?.status));
}
