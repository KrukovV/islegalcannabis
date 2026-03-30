import { describe, expect, test } from "vitest";
import { buildNotesExplainability } from "@/lib/notesExplainability";

describe("notesExplainability", () => {
  test("keeps note-driven stronger language in explainability only", () => {
    const result = buildNotesExplainability({
      notesWiki: "Medical cannabis is allowed in limited cases and enforcement is rare.",
      finalRecStatus: "Illegal",
      finalMedStatus: "Illegal"
    });

    expect(result.evidenceDelta).toBe("STRONG_CONFLICT");
    expect(result.evidenceDeltaApproved).toBe(false);
    expect(result.doesChangeFinalStatus).toBe(false);
    expect(result.notesTriggerPhrases.length).toBeGreaterThan(0);
    expect(result.notesInterpretationSummary).toContain("explainability");
  });

  test("does not invent a conflict when notes do not imply a stronger status", () => {
    const result = buildNotesExplainability({
      notesWiki: "Cannabis remains illegal and prohibited.",
      finalRecStatus: "Illegal",
      finalMedStatus: "Illegal"
    });

    expect(result.evidenceDelta).toBe("NONE");
    expect(result.doesChangeFinalStatus).toBe(false);
  });
});
