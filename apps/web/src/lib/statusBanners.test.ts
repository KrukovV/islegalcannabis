import { describe, expect, it } from "vitest";
import { STATUS_BANNERS } from "@islegal/shared";

describe("STATUS_BANNERS copy", () => {
  it("exposes provisional and needs_review copy", () => {
    expect(STATUS_BANNERS.provisional.title).toBeTruthy();
    expect(STATUS_BANNERS.provisional.body).toBeTruthy();
    expect(STATUS_BANNERS.needs_review.title).toBeTruthy();
    expect(STATUS_BANNERS.needs_review.body).toBeTruthy();
  });
});
