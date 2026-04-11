import { describe, expect, it } from "vitest";

import { ASCII_JOINT_SSOT, mirrorAsciiFrame } from "./ascii-ssot";

describe("ascii smoke ssot", () => {
  it("mirrors right-facing inhale pose into left-facing pose", () => {
    const right = "   o_.~~  \n  /|_\\    \n  / \\";
    expect(mirrorAsciiFrame(right)).toBe("  ~~._o   \n    /_|\\  \n     / \\  ");
  });

  it("keeps ember and smoke in every carry/near pose", () => {
    const allFrames = [
      ...ASCII_JOINT_SSOT.carry.right,
      ...ASCII_JOINT_SSOT.lift.right,
      ...ASCII_JOINT_SSOT.near.right,
      ...ASCII_JOINT_SSOT.exhale.right,
      ...ASCII_JOINT_SSOT.drop.right
    ];

    allFrames.forEach((frame) => {
      expect(frame.includes(".")).toBe(true);
      expect(frame.includes("~")).toBe(true);
      const lines = frame.split("\n");
      expect(lines.length).toBe(3);
    });
  });
});
