import { describe, expect, it } from "vitest";
import { normalizeKey } from "./lawStore";

describe("normalizeKey", () => {
  it("requires region for US", () => {
    expect(normalizeKey({ country: "US" })).toBeNull();
  });

  it("accepts non-US country without region", () => {
    expect(normalizeKey({ country: "de" })).toBe("DE");
  });
});
