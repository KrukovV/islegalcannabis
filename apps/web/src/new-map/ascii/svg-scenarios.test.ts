import { describe, expect, it } from "vitest";
import { ASCII_SCENARIOS } from "./ascii-scenarios/registry";
import { nextSvgStoryIndex, SVG_STORIES } from "./svg-scenarios";

describe("svg Antarctica storyboard", () => {
  it("translates every established Canvas scenario exactly once", () => {
    const legacyIds = ASCII_SCENARIOS.map((scenario) => scenario.id).sort();
    const svgIds = SVG_STORIES.map((story) => story.id).sort();

    expect(SVG_STORIES).toHaveLength(34);
    expect(new Set(svgIds).size).toBe(svgIds.length);
    expect(svgIds).toEqual(legacyIds);
  });

  it("interleaves wildlife instead of hiding it behind the complete people queue", () => {
    const firstWildlifeIndex = SVG_STORIES.findIndex((story) => Boolean(story.animals?.length));
    const firstWildlifeDelay = SVG_STORIES
      .slice(0, firstWildlifeIndex)
      .reduce((total, story) => total + story.durationMs, 0);

    expect(firstWildlifeIndex).toBe(1);
    expect(firstWildlifeDelay).toBeLessThanOrEqual(8_000);
  });

  it("retains all 18 established Antarctic mascot kinds as vector actors", () => {
    const animalKinds = new Set(SVG_STORIES.flatMap((story) => story.animals?.map((animal) => animal.kind) ?? []));

    expect(animalKinds).toEqual(new Set([
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
    ]));
  });

  it("keeps every scene populated and cycles without an empty cooldown", () => {
    SVG_STORIES.forEach((story) => {
      const actorCount = (story.people?.length ?? 0) + (story.animals?.length ?? 0);
      expect(actorCount, story.id).toBeGreaterThan(0);
      expect(story.durationMs, story.id).toBeGreaterThanOrEqual(7_000);
      expect(story.durationMs, story.id).toBeLessThanOrEqual(9_000);
    });
    expect(SVG_STORIES.reduce((total, story) => total + story.durationMs, 0)).toBeLessThanOrEqual(5 * 60_000);
    expect(nextSvgStoryIndex(SVG_STORIES.length - 1)).toBe(0);
  });

  it("keeps every smoking actor inside an explicit inhale/exhale story", () => {
    const smokingStories = SVG_STORIES
      .filter((story) => story.people?.some((person) => person.smoking))
      .map((story) => story.id);

    expect(smokingStories).toEqual([
      "walking-smoker",
      "pass-joint",
      "circle-smoke",
      "dance-smokers",
      "smoke-to-4-20",
      "orbit",
      "story-4-20",
      "smoke-circle-legacy",
      "dance-wave-legacy"
    ]);
    expect(SVG_STORIES.flatMap((story) => story.people ?? []).filter((person) => person.smoking)).toHaveLength(35);
  });
});
