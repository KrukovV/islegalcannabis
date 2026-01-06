import { beforeEach, describe, expect, it } from "vitest";
import { addEvent, getTripSummary, resetTripStoreForTests, startTrip } from "./tripStore";
import type { TripEvent } from "@islegal/shared";

function makeEventPayload(jurisdictionKey: string): Omit<TripEvent, "id" | "tripId" | "ts"> {
  const [country, region] = jurisdictionKey.split("-");
  return {
    jurisdictionKey,
    country,
    region: region || undefined,
    method: "gps",
    confidence: "high",
    statusLevel: "green",
    statusCode: "recreational_legal",
    verified_at: "2025-01-01",
    needs_review: false
  };
}

describe("tripStore", () => {
  beforeEach(() => {
    resetTripStoreForTests();
  });

  it("ignores events when trip inactive", () => {
    const result = addEvent(makeEventPayload("DE"));
    expect(result.added).toBe(false);
    expect(result.reason).toBe("inactive");
  });

  it("adds first event when trip active", () => {
    startTrip("free");
    const result = addEvent(makeEventPayload("DE"));
    expect(result.added).toBe(true);
    const { events } = getTripSummary();
    expect(events.length).toBe(1);
  });

  it("does not add duplicate jurisdiction events", () => {
    startTrip("free");
    addEvent(makeEventPayload("DE"));
    const result = addEvent(makeEventPayload("DE"));
    expect(result.added).toBe(false);
    expect(result.reason).toBe("duplicate_jurisdiction");
    const { events } = getTripSummary();
    expect(events.length).toBe(1);
  });

  it("adds event when jurisdiction changes", () => {
    startTrip("free");
    addEvent(makeEventPayload("DE"));
    const result = addEvent(makeEventPayload("NL"));
    expect(result.added).toBe(true);
    const { events } = getTripSummary();
    expect(events.length).toBe(2);
  });

  it("enforces free plan max events", () => {
    const trip = startTrip("free");
    for (let i = 0; i < trip.maxEvents; i += 1) {
      addEvent(makeEventPayload(`DE-${String(i)}`));
    }

    const result = addEvent(makeEventPayload("NL"));
    expect(result.added).toBe(false);
    expect(result.locked).toBe(true);
    const summary = getTripSummary();
    expect(summary.events.length).toBe(trip.maxEvents);
    expect(summary.trip?.isActive).toBe(false);
  });
});
