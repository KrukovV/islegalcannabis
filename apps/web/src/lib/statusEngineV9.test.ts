import { describe, expect, test } from "vitest";
import { buildStatusEngineFromPairStatuses, evaluateStatusEngineV9 } from "@/lib/statusEngineV9";

describe("statusEngineV9", () => {
  test("assigns GREEN only for adult-use legal", () => {
    const result = buildStatusEngineFromPairStatuses("Legal", "Illegal", []);
    expect(result.color).toBe("GREEN");
    expect(result.mapCategory).toBe("LEGAL_OR_DECRIM");
    expect(result.resultStatus).toBe("LEGAL");
    expect(result.triggeredRule).toBe("GREEN_ADULT_USE");
  });

  test("assigns GREEN for operational patient access", () => {
    const result = buildStatusEngineFromPairStatuses("Illegal", "Legal", []);
    expect(result.color).toBe("GREEN");
    expect(result.mapCategory).toBe("LEGAL_OR_DECRIM");
    expect(result.triggeredRule).toBe("GREEN_OPERATIONAL_PATIENT_ACCESS");
  });

  test("assigns YELLOW for decriminalized recreational regime", () => {
    const result = buildStatusEngineFromPairStatuses("Decrim", "Illegal", []);
    expect(result.color).toBe("YELLOW");
    expect(result.mapCategory).toBe("LIMITED_OR_MEDICAL");
    expect(result.resultStatus).toBe("DECRIM");
    expect(result.triggeredRule).toBe("YELLOW_DECRIM");
  });

  test("assigns YELLOW for limited medical pathway", () => {
    const result = buildStatusEngineFromPairStatuses("Illegal", "Limited", []);
    expect(result.color).toBe("YELLOW");
    expect(result.mapCategory).toBe("LIMITED_OR_MEDICAL");
    expect(result.triggeredRule).toBe("YELLOW_MEDICAL_LIMITED");
  });

  test("marks UNKNOWN when medical axis is unconfirmed for explicit illegal recreational status", () => {
    const result = buildStatusEngineFromPairStatuses("Illegal", "Unknown", []);
    expect(result.color).toBe("UNKNOWN");
    expect(result.mapCategory).toBe("UNKNOWN");
    expect(result.triggeredRule).toBe("UNKNOWN_MISSING_SIGNALS");
  });

  test("assigns RED when adult-use and patient access are explicitly excluded", () => {
    const result = evaluateStatusEngineV9({
      recreational: "ILLEGAL",
      medical: "NONE",
      enforcement: null,
      reason: [],
      missingSignal: ["recreational", "medical"],
      conflictingFacts: [],
      triggeredSignals: [],
      sourceUrl: null,
      confidence: "LOW"
    });
    expect(result.color).toBe("RED");
    expect(result.mapCategory).toBe("ILLEGAL");
    expect(result.triggeredRule).toBe("RED_NO_LEGAL_PATIENT_ACCESS");
  });

  test("marks UNKNOWN when neither axis can be derived", () => {
    const result = evaluateStatusEngineV9({
      recreational: null,
      medical: null,
      enforcement: null,
      reason: [],
      missingSignal: ["recreational", "medical"],
      conflictingFacts: [],
      triggeredSignals: [],
      sourceUrl: null,
      confidence: "LOW"
    });
    expect(result.color).toBe("UNKNOWN");
    expect(result.mapCategory).toBe("UNKNOWN");
    expect(result.resultStatus).toBe("UNKNOWN");
    expect(result.triggeredRule).toBe("UNKNOWN_MISSING_SIGNALS");
  });
});
