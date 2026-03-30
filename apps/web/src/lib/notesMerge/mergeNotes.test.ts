import { describe, expect, it } from "vitest";
import { mergeNotesSnapshots } from "./mergeNotes";

describe("notesMerge", () => {
  it("keeps stronger previous notes when status is unchanged", () => {
    const result = mergeNotesSnapshots(
      {
        notesText: "Detailed strong note from the official registry.",
        notesSourceStrength: 3,
        notesStatusHash: "Legal|Medical",
        status: { rec: "Legal", med: "Medical" }
      },
      {
        notesText: "Short weak note.",
        notesSourceStrength: 1,
        notesStatusHash: "Legal|Medical",
        status: { rec: "Legal", med: "Medical" }
      }
    );

    expect(result.notesText).toContain("Detailed strong note");
    expect(result.preservedStrongerNotes).toBe(true);
    expect(result.notesDeltaReason).toBe("UNCHANGED_STATUS");
  });

  it("produces an explicit delta when status changed", () => {
    const result = mergeNotesSnapshots(
      {
        notesText: "Medical only before change.",
        notesSourceStrength: 2,
        notesStatusHash: "Limited|Legal",
        status: { rec: "Limited", med: "Legal" }
      },
      {
        notesText: "Now recreational access is allowed.",
        notesSourceStrength: 1,
        notesStatusHash: "Legal|Legal",
        status: { rec: "Legal", med: "Legal" }
      }
    );

    expect(result.notesDeltaReason).toBe("STATUS_CHANGED");
    expect(result.notesStatusHash).toBe("Legal|Legal");
    expect(result.notesDeltaAddedText).toContain("Now recreational access");
  });

  it("does not degrade notes on unchanged status even when current text is shorter", () => {
    const result = mergeNotesSnapshots(
      {
        notesText: "Long note with operational detail and legal nuance.",
        notesSourceStrength: 2,
        notesStatusHash: "Decrim|Legal",
        status: { rec: "Decrim", med: "Legal" }
      },
      {
        notesText: "Short note",
        notesSourceStrength: 2,
        notesStatusHash: "Decrim|Legal",
        status: { rec: "Decrim", med: "Legal" }
      }
    );

    expect(result.notesText).toBe("Long note with operational detail and legal nuance.");
    expect(result.notesDeltaReason).toBe("UNCHANGED_STATUS");
  });
});
