import { describe, expect, it } from "vitest";
import { applyDialogStyle, fallbackHumanized } from "./dialogStyle";

describe("dialogStyle", () => {
  it("adds an opener without appending proactive offers", () => {
    const styled = applyDialogStyle("Cannabis is illegal by law.", "legal", "en");
    expect(styled).toMatch(/Here it is plainly:|Let's break it down calmly:|If we keep it factual:|Short and honest:/);
    expect(styled).not.toContain("Want to compare");
    expect(styled).not.toContain("Want me");
    expect(styled).toContain("formally illegal");
  });

  it("returns a humanized fallback for empty answers", () => {
    const fallback = fallbackHumanized("Germany", "legal", "ru");
    expect(fallback).toContain("Смотри, отвечу прямо:");
    expect(fallback).toContain("Germany");
  });
});
