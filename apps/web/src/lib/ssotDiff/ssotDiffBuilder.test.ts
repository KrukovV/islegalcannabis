import { describe, expect, it } from "vitest";
import { buildCurrentSsotSnapshot, diffSnapshots } from "./ssotDiffBuilder";

describe("ssotDiffBuilder", () => {
  it("builds a snapshot row with merged official sources", () => {
    const snapshot = buildCurrentSsotSnapshot({
      generatedAt: "2026-03-11T00:00:00.000Z",
      geoUniverse: ["DE"],
      claimsItems: {
        DE: {
          geo_key: "DE",
          recreational_status: "Illegal",
          medical_status: "Legal",
          notes_text: "note",
          wiki_row_url: "https://en.wikipedia.org/wiki/Germany"
        }
      },
      enrichedItems: {
        DE: [{ url: "https://gov.example/de", official: true }]
      },
      officialBadgeItems: {
        DE: [{ url: "https://ministry.example/de" }, { url: "https://gov.example/de" }]
      }
    });

    expect(snapshot.row_count).toBe(1);
    expect(snapshot.rows[0]).toMatchObject({
      geo: "DE",
      rec_status: "Illegal",
      med_status: "Legal",
      wiki_page_url: "https://en.wikipedia.org/wiki/Germany"
    });
    expect(snapshot.rows[0].official_sources).toEqual([
      "https://gov.example/de",
      "https://ministry.example/de"
    ]);
    expect(snapshot.rows[0].notes_hash).toHaveLength(12);
  });

  it("detects status, notes, official source and wiki page changes", () => {
    const oldSnapshot = buildCurrentSsotSnapshot({
      generatedAt: "2026-03-11T00:00:00.000Z",
      geoUniverse: ["DE"],
      claimsItems: {
        DE: {
          geo_key: "DE",
          recreational_status: "Illegal",
          medical_status: "Legal",
          notes_text: "old note",
          wiki_row_url: "https://en.wikipedia.org/wiki/Germany"
        }
      },
      enrichedItems: { DE: [{ url: "https://gov.example/de", official: true }] },
      officialBadgeItems: {}
    });
    const newSnapshot = buildCurrentSsotSnapshot({
      generatedAt: "2026-03-11T04:00:00.000Z",
      geoUniverse: ["DE"],
      claimsItems: {
        DE: {
          geo_key: "DE",
          recreational_status: "Legal",
          medical_status: "Legal",
          notes_text: "new note",
          wiki_row_url: "https://en.wikipedia.org/wiki/Cannabis_in_Germany"
        }
      },
      enrichedItems: { DE: [{ url: "https://gov.example/de", official: true }] },
      officialBadgeItems: { DE: [{ url: "https://health.example/de" }] }
    });

    const changes = diffSnapshots(oldSnapshot, newSnapshot);
    expect(changes.map((entry) => entry.type)).toEqual([
      "NOTES_UPDATE",
      "OFFICIAL_SOURCE_ADDED",
      "STATUS_CHANGE",
      "WIKI_PAGE_CHANGED"
    ]);
  });
});
