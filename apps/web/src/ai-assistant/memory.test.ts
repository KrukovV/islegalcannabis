import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMemory, retrieveMemory, saveMemory, scoreMemory } from "./memory";

const TEST_FILE = path.join(os.tmpdir(), `islegal-memory-${process.pid}.json`);

afterEach(() => {
  process.env.AI_MEMORY_FILE = TEST_FILE;
  if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
});

describe("memory", () => {
  it("saves and retrieves matching items by intent and location", () => {
    process.env.AI_MEMORY_FILE = TEST_FILE;
    saveMemory({
      query: "Germany cannabis",
      intent: "legal",
      location: "DE",
      answer: "Germany allows legal access with restrictions, while distribution stays illegal.",
      score: 0.8
    });
    saveMemory({
      query: "Dubai airport weed",
      intent: "airport",
      location: "AE",
      answer: "Dubai airport stays high risk and carrying cannabis there can end very badly.",
      score: 0.7
    });

    const matches = retrieveMemory("Is cannabis legal in Germany?", "legal", "DE");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.location).toBe("DE");
    expect(matches[0]?.answer).toContain("distribution stays illegal");
  });

  it("caps the store at 200 highest-ranked items", () => {
    process.env.AI_MEMORY_FILE = TEST_FILE;
    for (let index = 0; index < 205; index += 1) {
      saveMemory({
        query: `query ${index}`,
        intent: "legal",
        location: "DE",
        answer: `Answer ${index} with enough length to be retained and ranked above zero for storage purposes.`,
        score: index / 100
      });
    }
    const items = loadMemory();
    expect(items.length).toBe(200);
    expect(items[0]?.score).toBeGreaterThan(items.at(-1)?.score || 0);
  });

  it("scores longer reused answers higher", () => {
    expect(scoreMemory("short answer", false, false)).toBe(0);
    expect(scoreMemory("a".repeat(140), true, true)).toBe(1);
  });

  it("skips memory from another active location", () => {
    process.env.AI_MEMORY_FILE = TEST_FILE;
    saveMemory({
      query: "Iran cannabis",
      intent: "legal",
      location: "IR",
      answer: "Iran answer.",
      score: 0.8
    });
    saveMemory({
      query: "Germany cannabis",
      intent: "legal",
      location: "DE",
      answer: "Germany answer.",
      score: 0.9
    });

    const matches = retrieveMemory("Is cannabis legal?", "legal", "IR", "IR");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.location).toBe("IR");
    expect(matches[0]?.answer).toContain("Iran");
  });
});
