import { describe, expect, it } from "vitest";
import { buildOfficialOwnershipView } from "./officialOwnershipView";
import { readOfficialLinkOwnership } from "./officialLinkOwnership";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";

describe("officialOwnershipView", () => {
  const root = findRepoRoot(process.cwd());
  const dataset = readOfficialLinkOwnership(root);

  it("keeps one visible row per protected registry entry", () => {
    const view = buildOfficialOwnershipView({
      dataset,
      countryRows: []
    });

    expect(view.rawTotal).toBe(418);
    expect(view.rows).toHaveLength(view.rawTotal);
    expect(view.effectiveTotal).toBe(dataset.effective_registry_total);
  });

  it("does not lose filtered ownership rows from the raw ownership view", () => {
    const view = buildOfficialOwnershipView({
      dataset,
      countryRows: []
    });

    expect(view.filteredRows.length).toBeGreaterThan(0);
    expect(view.rows.some((row) => row.exclusionReason !== "none")).toBe(true);
  });
});
