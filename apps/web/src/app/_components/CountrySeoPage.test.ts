import { describe, expect, it } from "vitest";
import { sanitizeEvidenceQuoteText } from "./CountrySeoPage";

describe("CountrySeoPage quote sanitizer", () => {
  it("strips wiki table style preamble from evidence quotes", () => {
    const sanitized = sanitizeEvidenceQuoteText(
      'style="background:#C4C9CD;" | {{Hs|5}} Cannabis is strictly illegal in Wyoming.'
    );
    expect(sanitized).toBe("Cannabis is strictly illegal in Wyoming.");
  });

  it("removes html/style tags and wiki wrappers but keeps readable text", () => {
    const sanitized = sanitizeEvidenceQuoteText(
      '<style>.x{color:red}</style><span>[[Cannabis|Cannabis]] itself is not allowed for medical purposes.</span>'
    );
    expect(sanitized).toBe("Cannabis itself is not allowed for medical purposes.");
  });
});
