import { describe, expect, it } from "vitest";
import { applyDialogStyle, fallbackHumanized } from "./dialogStyle";

describe("dialogStyle", () => {
  it("adds an opener and follow-up to a plain answer", () => {
    const styled = applyDialogStyle("Cannabis is illegal by law.", "legal", "en");
    expect(styled).toMatch(/Here it is plainly:|Let's break it down calmly:|If we keep it factual:|Short and honest:/);
    expect(styled).toContain("Want to compare it with another country?");
    expect(styled).toContain("formally illegal");
  });

  it("returns a humanized fallback for empty answers", () => {
    const fallback = fallbackHumanized("Germany", "legal", "ru");
    expect(fallback).toContain("Смотри, отвечу прямо:");
    expect(fallback).toContain("Germany");
  });
});
