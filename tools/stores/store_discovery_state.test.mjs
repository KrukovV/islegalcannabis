import assert from "node:assert/strict";
import test from "node:test";
import { isRetainablePartialRegistrySource, resolveStoreDiscoveryState } from "./store_discovery_state.mjs";

test("retained certificate-blocked official registry is partial, never found or absent", () => {
  assert.equal(isRetainablePartialRegistrySource({ official: true, status: "PENDING_C3_ACCESS_BLOCKED" }), true);
  assert.equal(resolveStoreDiscoveryState("GREEN", {
    hasRetainablePendingRegistry: true,
    hasCandidate: true,
  }), "LEGAL_REGISTRY_PARTIAL");
});

test("validated registry and fail-closed legal colors retain precedence", () => {
  assert.equal(resolveStoreDiscoveryState("GREEN", { hasValidatedRegistry: true, hasRetainablePendingRegistry: true }), "LEGAL_OFFICIAL_REGISTRY_FOUND");
  assert.equal(resolveStoreDiscoveryState("RED", { hasValidatedRegistry: true }), "STORES_NOT_LEGAL");
  assert.equal(resolveStoreDiscoveryState("UNKNOWN", { hasCandidate: true }), "UNKNOWN_LEGALITY");
});

test("a source lead remains needs-extraction only when no retained registry exists", () => {
  assert.equal(resolveStoreDiscoveryState("GREEN", { hasCandidate: true }), "LEGAL_SOURCE_NEEDS_EXTRACTION");
  assert.equal(resolveStoreDiscoveryState("GREEN"), "LEGAL_REGISTRY_NOT_FOUND");
  assert.equal(resolveStoreDiscoveryState("YELLOW"), "LEGAL_NO_STOREFRONT_MODEL");
  assert.equal(isRetainablePartialRegistrySource({ official: false, status: "PENDING_C3_ACCESS_BLOCKED" }), false);
});
