import { describe, expect, it } from "vitest";

import { ASCII_ANTARCTIC_MASCOT_SSOT, ASCII_JOINT_SSOT, framesForAntarcticMascot, mirrorAsciiFrame } from "./ascii-ssot";
import { ASCII_SCENARIOS } from "./ascii-scenarios/registry";

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

  it("keeps Antarctic mascot faces as independent, five-frame canvas poses", () => {
    expect(Object.keys(ASCII_ANTARCTIC_MASCOT_SSOT)).toEqual([
      "penguin",
      "seal",
      "petrel",
      "orca",
      "skua",
      "albatross",
      "krill",
      "leopardSeal",
      "emperorPenguin",
      "weddellSeal",
      "snowPetrel",
      "crabeaterSeal",
      "adeliePenguin",
      "elephantSeal",
      "minkeWhale",
      "chinstrapPenguin",
      "antarcticFurSeal",
      "giantPetrel"
    ]);
    Object.entries(ASCII_ANTARCTIC_MASCOT_SSOT).forEach(([kind, frames]) => {
      expect(frames).toHaveLength(5);
      const widths = new Set<number>();
      frames.forEach((frame) => {
        expect(frame).toContain("(");
        const lines = frame.split("\n");
        expect(lines).toHaveLength(3);
        widths.add(Math.max(...lines.map((line) => line.length)));
      });
      expect(widths).toEqual(new Set([9]));
      const copy = framesForAntarcticMascot(kind as keyof typeof ASCII_ANTARCTIC_MASCOT_SSOT);
      copy[0] = "changed";
      expect(ASCII_ANTARCTIC_MASCOT_SSOT[kind as keyof typeof ASCII_ANTARCTIC_MASCOT_SSOT][0]).not.toBe("changed");
    });
  });

  it("keeps all Antarctic face scenes in the existing auto scenario registry", () => {
    const ids = new Set(ASCII_SCENARIOS.map((scenario) => scenario.id));
    expect(ids).toEqual(expect.objectContaining(new Set([
      "antarctic-face-chorus",
      "antarctic-face-parade",
      "antarctic-face-constellation",
      "antarctic-face-tidepool",
      "antarctic-face-aurora",
      "antarctic-face-rookery",
      "antarctic-face-ice-floe",
      "antarctic-face-pack-ice",
      "antarctic-face-polynya",
      "antarctic-face-iceberg",
      "antarctic-face-shelf"
    ])));
  });
});
