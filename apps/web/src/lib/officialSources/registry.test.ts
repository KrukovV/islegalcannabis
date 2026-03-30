import { describe, expect, it } from "vitest";
import {
  mergeOfficialRegistryEntries,
  mergeOfficialSources,
  OFFICIAL_REGISTRY_FILTERED_FLOOR,
  OFFICIAL_REGISTRY_RAW_FLOOR,
  summarizeOfficialRegistry
} from "./registry";

describe("officialSources registry", () => {
  it("merges sources append/update-only by URL", () => {
    const merged = mergeOfficialSources(
      [
        {
          url: "https://gov.example/a",
          status: "active",
          title: "Old title"
        }
      ],
      [
        {
          url: "https://gov.example/a",
          status: "redirected",
          title: "New title"
        },
        {
          url: "https://gov.example/b",
          status: "timeout"
        }
      ]
    );

    expect(merged).toEqual([
      {
        url: "https://gov.example/a",
        status: "redirected",
        title: "New title"
      },
      {
        url: "https://gov.example/b",
        status: "timeout"
      }
    ]);
  });

  it("keeps previous URLs when incoming entry only updates metadata for the same geo", () => {
    const merged = mergeOfficialRegistryEntries(
      [
        {
          geo: "DE",
          sources: [{ url: "https://bund.de/a", status: "active" }]
        }
      ],
      [
        {
          geo: "de",
          sources: [{ url: "https://bund.de/b", status: "blocked" }]
        }
      ]
    );

    expect(merged).toEqual([
      {
        geo: "DE",
        sources: [
          { url: "https://bund.de/a", status: "active", host: undefined },
          { url: "https://bund.de/b", status: "blocked", host: undefined }
        ]
      }
    ]);
  });

  it("protects both raw and filtered registry floors", () => {
    const domains = Array.from({ length: OFFICIAL_REGISTRY_RAW_FLOOR }, (_, index) => `gov-${index}.example`);
    const summary = summarizeOfficialRegistry({ domains });

    expect(summary.rawDomainCount).toBe(OFFICIAL_REGISTRY_RAW_FLOOR);
    expect(summary.filteredDomainCount).toBe(OFFICIAL_REGISTRY_FILTERED_FLOOR);
    expect(summary.floorProtected).toBe(true);
    expect(summary.filteredFloorProtected).toBe(true);
  });
});
