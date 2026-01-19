import test from "node:test";
import assert from "node:assert/strict";
import { nearestLegalBorder } from "./nearest_legal.mjs";

test("nearestLegalBorder picks closest green centroid", () => {
  const current = { lat: 41.8781, lon: -87.6298, statusLevel: "red" };
  const candidates = [
    { id: "US-IL", statusLevel: "green", lat: 41.8781, lon: -87.6298 },
    { id: "CA-ON", statusLevel: "green", lat: 43.6532, lon: -79.3832 },
    { id: "US-IN", statusLevel: "red", lat: 39.7684, lon: -86.1581 }
  ];
  const result = nearestLegalBorder(current, candidates);
  assert.ok(result);
  assert.equal(result.id, "US-IL");
  assert.ok(result.distanceKm >= 0);
});
