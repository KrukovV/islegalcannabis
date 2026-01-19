import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { hasPaidAccess } from "./features";

const originalEnv = process.env.NODE_ENV;

describe("hasPaidAccess", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("returns false when paid=0", () => {
    expect(hasPaidAccess({ searchParams: { paid: "0" } })).toBe(false);
  });

  it("returns true when paid=1", () => {
    expect(hasPaidAccess({ searchParams: { paid: "1" } })).toBe(true);
  });

  it("returns false when no params and no cookie", () => {
    expect(hasPaidAccess()).toBe(false);
  });
});
