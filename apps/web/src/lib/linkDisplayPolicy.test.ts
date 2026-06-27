import { describe, expect, it } from "vitest";
import { getLinkScope, isSameLink, isSameLinkWithoutHash } from "./linkDisplayPolicy";

describe("linkDisplayPolicy", () => {
  it("classifies project and external links", () => {
    expect(getLinkScope("/c/usa")).toBe("project");
    expect(getLinkScope("/wiki/Cannabis_in_California")).toBe("project");
    expect(getLinkScope("https://en.wikipedia.org/wiki/Cannabis_in_California")).toBe("external");
    expect(getLinkScope("#law-summary")).toBe("project");
  });

  it("treats same page links with hash as different when hash differs", () => {
    expect(isSameLink("/c/usa", "/c/usa#law-summary")).toBe(false);
    expect(isSameLink("/c/usa#law-summary", "/c/usa#law-summary")).toBe(true);
    expect(isSameLinkWithoutHash("/c/usa", "/c/usa#law-summary")).toBe(true);
  });

  it("compares absolute and relative links in stable way", () => {
    expect(isSameLink("https://www.islegal.local/path#a", "/path#a", "/path")).toBe(true);
    expect(isSameLink("https://www.example.com/path#a", "/path#a", "/path")).toBe(false);
    expect(isSameLink("/path#a", "/path#b", "/path")).toBe(false);
  });
});
