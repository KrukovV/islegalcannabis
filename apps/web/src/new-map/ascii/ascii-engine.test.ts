import { describe, expect, it } from "vitest";
import { ASCII_JOINT_SSOT } from "./ascii-ssot";
import { getJointAnchor, stripJointVisuals } from "./ascii-engine";

describe("ascii-engine joint render helpers", () => {
  it("finds hand-anchored joint positions for both facings", () => {
    const rightFrame = ASCII_JOINT_SSOT.near.right[0];
    const leftFrame = ASCII_JOINT_SSOT.near.left[0];
    const rightAnchor = getJointAnchor(rightFrame, "right", 100, 100);
    const leftAnchor = getJointAnchor(leftFrame, "left", 100, 100);

    expect(rightAnchor).toBeTruthy();
    expect(leftAnchor).toBeTruthy();
    expect(rightAnchor?.emberX).toBeGreaterThan(rightAnchor!.baseX);
    expect(leftAnchor?.emberX).toBeLessThan(leftAnchor!.baseX);
  });

  it("keeps body skeleton while stripping ascii joint, ember and smoke", () => {
    const frame = ASCII_JOINT_SSOT.exhale.right[0];
    const stripped = stripJointVisuals(frame);

    expect(stripped).not.toContain("~");
    expect(stripped).not.toContain("_");
    expect(stripped).not.toContain("`");
    expect(stripped).toContain("o");
    expect(stripped).toContain("/");
    expect(stripped).toContain("\\");
  });
});
