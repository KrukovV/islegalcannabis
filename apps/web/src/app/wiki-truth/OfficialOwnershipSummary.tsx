"use client";

import type { OfficialOwnershipViewModel } from "@/lib/officialSources/officialOwnershipView";

export default function OfficialOwnershipSummary({ view }: { view: OfficialOwnershipViewModel }) {
  return (
    <section className="sectionCard" data-testid="official-ownership-summary">
      <h2>Official ownership summary</h2>
      <div className="boundaryGrid">
        <div>
          <strong>Raw protected registry</strong>
          <div>
            {view.rawTotal} / {view.rawTotal}
          </div>
        </div>
        <div>
          <strong>Resolved ownership rows</strong>
          <div>{view.resolvedOwnershipTotal}</div>
        </div>
        <div>
          <strong>Effective ownership rows</strong>
          <div>{view.effectiveRowsTotal}</div>
        </div>
        <div>
          <strong>Filtered rows</strong>
          <div>{view.filteredRowsTotal}</div>
        </div>
        <div>
          <strong>Excluded rows</strong>
          <div>{view.excludedRowsTotal}</div>
        </div>
        <div>
          <strong>Filtered registry total</strong>
          <div>{view.effectiveTotal}</div>
        </div>
        <div>
          <strong>Global regulatory references</strong>
          <div>{view.globalTotal}</div>
        </div>
        <div>
          <strong>Countries with strong official links</strong>
          <div>{view.countriesWithStrongOfficialLinks}</div>
        </div>
        <div>
          <strong>Countries with weak-only links</strong>
          <div>{view.countriesWithWeakOnlyOfficialLinks}</div>
        </div>
        <div>
          <strong>Countries with fallback-only links</strong>
          <div>{view.countriesWithFallbackOnlyLinks}</div>
        </div>
        <div>
          <strong>Countries with effective links</strong>
          <div>{view.countriesWithEffectiveLinks}</div>
        </div>
        <div>
          <strong>Excluded protected links</strong>
          <div>{view.excludedProtectedTotal}</div>
        </div>
        <div>
          <strong>Banned filtered</strong>
          <div>{view.bannedFilteredTotal}</div>
        </div>
        <div>
          <strong>Unknown ownership</strong>
          <div>{view.unknownOwnershipTotal}</div>
        </div>
        <div>
          <strong>Multi-geo / global</strong>
          <div>
            {view.multiGeoTotal} / {view.globalTotal}
          </div>
        </div>
        <div>
          <strong>Countries without effective links</strong>
          <div>{view.countriesWithoutEffectiveLinks}</div>
        </div>
        <div>
          <strong>Countries with 2+ effective links</strong>
          <div>{view.countriesWithMultipleEffectiveLinks}</div>
        </div>
        <div>
          <strong>States with effective links</strong>
          <div>{view.statesWithEffectiveLinks}</div>
        </div>
      </div>
      <p className="sectionHint">
        Raw registry rows remain protected and non-shrinking. Coverage and `Official=yes` use only effective
        owner-matched rows. Global regulatory references stay visible here, but do not count as official country links.
      </p>
    </section>
  );
}
