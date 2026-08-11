import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { WikiTruthCannabisLawMatrix } from "@/lib/wikiTruthCannabisLawMatrix";
import type { WikiTruthCannabisLawRow } from "@/lib/wikiTruthCannabisLawMatrix";
import {
  buildWikiTruthColorComparison,
  deriveOfficialLawMapCategory,
  summarizeOfficialEvidenceRevalidation,
} from "@/lib/wikiTruthColorComparison";
import { deriveOfficialTruthColor } from "@/lib/wikiTruthColorEngine";
import {
  buildCountrySourceSnapshot,
  buildUsStateSourceSnapshot,
} from "@/new-map/countrySource";

const PROJECT_NULL_GEOS = ["BJN", "BRT", "SCR", "SER", "KAS", "SPI", "PGA"];
const EXPECTED_OFFICIAL_COLORS = {
  BJN: "UNKNOWN",
  BRT: "UNKNOWN",
  SCR: "UNKNOWN",
  SER: "UNKNOWN",
  KAS: "UNKNOWN",
  SPI: "UNKNOWN",
  PGA: "UNKNOWN",
} as const;

function findRepoRoot(start: string): string {
  let current = start;
  for (let index = 0; index < 6; index += 1) {
    if (
      fs.existsSync(
        path.join(
          current,
          "data",
          "reviews",
          "wiki-truth-cannabis-law-matrix-307.json",
        ),
      )
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return start;
}

function readMatrix(): WikiTruthCannabisLawMatrix {
  const root = findRepoRoot(process.cwd());
  return JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "data",
        "reviews",
        "wiki-truth-cannabis-law-matrix-307.json",
      ),
      "utf8",
    ),
  ) as WikiTruthCannabisLawMatrix;
}

function readTruthColorByGeo(): ReadonlyMap<string, string> {
  const root = findRepoRoot(process.cwd());
  const payload = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "data",
        "reviews",
        "wiki-truth-307-final-reconciliation.json",
      ),
      "utf8",
    ),
  ) as { rows?: Array<{ geo?: string; truthColor?: string }> };
  return new Map(
    (payload.rows || [])
      .filter((row) => row.geo && row.truthColor)
      .map((row) => [String(row.geo).toUpperCase(), String(row.truthColor)]),
  );
}

function asOfficialRow(overrides: {
  recreational: string;
  medical: string;
  enforcement?: string;
  sourceCoverage?: WikiTruthCannabisLawRow["sourceCoverage"];
}, sourceCoverageOverride?: WikiTruthCannabisLawRow["sourceCoverage"]): WikiTruthCannabisLawRow {
  return {
    geo: "ZZZ",
    territory: "ZZ",
    projectStatus: {
      recreational: overrides.recreational,
      medical: overrides.medical,
      enforcement: overrides.enforcement || "STRICT",
    },
    officialStatus: {
      recreational: overrides.recreational,
      medical: overrides.medical,
      enforcement: overrides.enforcement || null,
    },
    directOfficialCannabisLawLinks: [],
    candidateLinksAwaitingVisualReview: [],
    officialContextLinks: [],
    supplementalOfficialLinks: [],
    sourceCoverage:
      sourceCoverageOverride || overrides.sourceCoverage || "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    differenceStatus: "-",
    differenceDescription: "",
    parserSignals: [],
    derivedStatus: null,
    visualReviewStatus: "verified",
    screenshotPaths: [],
    reviewConfidence: "high",
    reviewNotes: "",
    latestColorReaudit: null,
  };
}

describe("wiki-truth cannabis color comparison", () => {
  test("keeps revalidation and visual-access state outside legal truth derivation", () => {
    const row = asOfficialRow({
      recreational: "ILLEGAL",
      medical: "LIMITED",
    });
    row.directOfficialCannabisLawLinks = [{
      title: "Current official cannabis law",
      url: "https://official.example/law",
      sourceKind: "CURRENT_PRIMARY_LAW",
      verification: "MANUAL_LEGAL_REVIEW",
      confidence: "high",
      note: "Current cannabis-specific limited medical route.",
      revalidation: {
        checked_at: "2026-08-12T00:00:00.000Z",
        final_url: "https://official.example/law",
        http_status: 403,
        etag: null,
        last_modified: null,
        content_type: "text/html",
        content_length: 0,
        document_sha256: null,
        relevant_fragment_sha256: null,
        revalidation_state: "ACCESS_BLOCKED",
        access_state: "HTTP_STATUS_403",
        change_reason: "HTTP_STATUS_403_IS_ACCESS_STATE_ONLY",
        queue: ["C2", "C3"],
        dependent_geos: ["ZZZ"],
      },
    }];
    const before = deriveOfficialLawMapCategory(row);
    row.directOfficialCannabisLawLinks[0].revalidation = {
      ...row.directOfficialCannabisLawLinks[0].revalidation!,
      revalidation_state: "NOT_MODIFIED",
      access_state: "HTTP_OK",
      change_reason: "HTTP_304_CONDITIONAL_GET",
    };
    expect(deriveOfficialLawMapCategory(row)).toBe(before);
    expect(summarizeOfficialEvidenceRevalidation(row)).toContain("NOT_MODIFIED=1");
  });

  test("keeps all seven project-null scope exclusions uncolored", () => {
    const matrix = readMatrix();
    const mapRows = [
      ...buildCountrySourceSnapshot().features,
      ...buildUsStateSourceSnapshot().features,
    ].map((feature) => ({
      geo: String(feature.properties?.geo || ""),
      finalMapCategory: feature.properties?.mapCategory,
    }));
    const comparison = buildWikiTruthColorComparison(
      matrix,
      mapRows,
      [],
      readTruthColorByGeo(),
    );
    const seven = comparison.filter((row) => PROJECT_NULL_GEOS.includes(row.geo));
    const currentGreyGeos = comparison
      .filter((row) => row.current.category === "UNKNOWN")
      .map((row) => row.geo)
      .sort();

    expect(matrix.counts.noProjectStatus).toBe(7);
    expect(new Set(mapRows.map((row) => row.geo)).size).toBe(307);
    expect(currentGreyGeos).toEqual([...PROJECT_NULL_GEOS].sort());
    expect(seven).toHaveLength(7);
    for (const row of seven) {
      expect(row.current.category, row.geo).toBe("UNKNOWN");
      expect(row.current.label, row.geo).toBe("Без цвета — нет статуса проекта");
      expect(row.official.category, row.geo).toBe(
        EXPECTED_OFFICIAL_COLORS[row.geo as keyof typeof EXPECTED_OFFICIAL_COLORS],
      );
    }
  });

  test("publishes supplemental official re-audit links without duplicate row URLs", () => {
    const matrix = readMatrix();
    const supplementalOfficialLinks = matrix.rows.flatMap(
      (row) => row.supplementalOfficialLinks,
    );

    expect(supplementalOfficialLinks.length).toBeGreaterThan(0);
    expect(matrix.counts.supplementalOfficialLinks).toBe(
      supplementalOfficialLinks.length,
    );
    expect(matrix.counts.rowsWithAnyOfficialUrl).toBe(307);
    for (const row of matrix.rows) {
      expect(new Set(row.screenshotPaths).size, row.geo).toBe(
        row.screenshotPaths.length,
      );
      const urls = [
        ...row.directOfficialCannabisLawLinks,
        ...row.officialContextLinks,
        ...row.supplementalOfficialLinks,
      ].map((link) => link.url.replace(/#.*$/, "").replace(/\/+$/, ""));
      expect(new Set(urls).size, row.geo).toBe(urls.length);
    }
  });

  test("derives official truth-first colors by explicit legal mode rules", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "LEGAL_ADULT_USE_REGULATED",
          medical: "NONE",
        }),
      ),
    ).toBe("LEGAL_OR_DECRIM");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "DECRIMINALIZED_OR_LIMITED_PRIVATE_USE_SCOPE__NON_GUILTY",
          medical: "NONE",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL_UNDER_ARTICLE_1",
          medical: "PRESCRIPTION_CANNABIS_MEDICINES",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical:
            "LIMITED_GENERAL_NARCOTIC_PRESCRIPTION_CHANNEL_APPLIES_TO_SCHEDULED_CANNABIS",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational:
            "CURRENT_CANNABIS_SPECIFIC_RECREATIONAL_STATUS_UNCONFIRMED_HISTORIC_PROHIBITION_NOT_CURRENT_FORCE_PROVEN",
          medical:
            "CURRENT_GENERIC_NARCOTIC_MEDICINE_PRESCRIPTION_AND_IMPORT_FRAMEWORK_CANNABIS_SPECIFIC_APPLICABILITY_UNPROVEN",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational:
            "CURRENT_CANNABIS_SPECIFIC_RECREATIONAL_STATUS_UNCONFIRMED_GENERAL_DOMESTIC_DRUGS_AND_PLANT_DEFINITION_WITH_TREATY_CONTEXT_ONLY",
          medical:
            "CURRENT_GENERIC_CONTROLLED_SUBSTANCE_PRESCRIPTION_AUTHORIZATION_AND_IMPORT_SYSTEM_CANNABIS_PRODUCT_AND_PATIENT_APPLICABILITY_UNPROVEN",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "NONE_NO_PATIENT_ACCESS_FOUND",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational:
            "ILLEGAL_CANNABIS_TABLE_I_HIGH_RISK_DRUG_PERSONAL_USE_CULTIVATION_ACQUISITION_AND_POSSESSION_PUNISHABLE",
          medical:
            "MEDICAL_CANNABIS_PATIENT_ACCESS_EXPRESSLY_PROHIBITED_TABLE_I_HIGH_RISK_DRUG_GENERAL_PRESCRIPTION_EXCEPTION_FOR_OTHER_DRUGS_ONLY",
          enforcement: "CURRENT_CANNABIS_SPECIFIC_CUSTODIAL_PENALTY_PROVEN",
        }),
      ),
    ).toBe("ILLEGAL");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "REGULATED_PATIENT_RECOMMENDATION_CARD_AND_DISPENSARY_FRAMEWORK",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");
  });

  test("keeps cultivation/association modes from being treated as adult-use legal", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational:
            "LEGAL_FOR_ADULT_POSSESSION_UP_TO_TWO_OUNCES_HOME_CULTIVATION_AND_NONCOMMERCIAL_SHARING; BUYING_AND_SELLING_EXCLUDED",
          medical: "NONE",
        }),
      ),
    ).not.toBe("LEGAL_OR_DECRIM");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "PHARMACEUTICAL_PRODUCTION_EXCEPTIONS",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");
  });

  test("classifies medical-only variants and explicit patient-access variants", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "ONLY_CBD_MEDICINES",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "SATIVEX_ONLY",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "ONLY_CBD_MEDICINES; PATIENT_ACCESS; REGISTRY; PATIENT_CARD",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical:
            "LICENSED_PRODUCTION_FOR_MEDICAL_AND_EXPORT_ONLY_NO_DOMESTIC_PATIENT_ACCESS",
        }),
      ),
    ).toBe("UNKNOWN");
  });

  test("treats lifecycle-only law states as non-green and evidence-gapped", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "LEGAL_ADULT_USE_REGULATED_BILL_PROPOSAL",
          medical: "NONE",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL_WITHOUT_ENACTED_IMPLEMENTATION_DRAFT",
          medical: "NONE",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "LEGAL_ADULT_USE_REPEALED_ACT_IN_EFFECT",
          medical: "NONE",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "LEGAL_FOR_ADULT_POSSESSION_UP_TO_TWO_OUNCES_HOME_CULTIVATION_AND_NONCOMMERCIAL_SHARING; ADULT_RETAIL_SALES_NOT_YET_GENERAL",
          medical: "NONE",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");
  });

  test("never uses non-patient modes as green triggers", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "PRODUCTION_ONLY; MEDICAL_ACCESS_CONTEXT_PROVISIONAL",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "RESEARCH_EXEMPTIONS; IMPORT_ONLY_WITHOUT_PATIENT_ACCESS",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL_PROHIBITED_NARCOTICS_IMPORT",
          medical: "NONE_NO_PATIENT_ACCESS_FOUND",
          enforcement: "STRICT",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "EXPORT_ONLY; COMMERCIAL_DISPATCH_PERMITS",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "PATIENT_ACCESS_PRODUCT_SCOPE_NOT_PROVEN; REGULATED_CULTIVATION",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "CBD_MEDICINES_AND_SATIVEX_PRODUCT_PATH_ONLY",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical:
            "LIMITED_FOR_CANNABINOID_PHARMACEUTICALS_ONLY; STRICT_SUPPLY_PRESCRIPTION_AND_DISPENSATION_FRAMEWORKS_FOR_HSA_REGISTERED_CONDITIONS",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");
  });

  test("keeps patient-program infrastructure yellow until operational patient supply is proven", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "REGULATED_PATIENT_RECOMMENDATION_CARD_AND_DISPENSARY_FRAMEWORK",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "REGULATED_CERTIFIED_PATIENT_PROGRAM",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "UNCONFIRMED_BY_THIS_PAGE",
          medical: "REGULATED",
        }),
      ),
    ).toBe("UNKNOWN");

    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "AUTHORISED_PROGRAM_WITH_IMPLEMENTATION_LIMITS",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");
  });

  test("keeps prescription access to own patients yellow without proven operational supply", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL",
          medical: "REGULATED; OFFICIAL_TEXT_ALLOWS_LISTED_PROFESSIONALS_TO_SUPPLY_TO_OWN_PATIENTS_WITH_OFFICIAL_PRESCRIPTION",
        }),
      ),
    ).toBe("LIMITED_OR_MEDICAL");
  });

  test("does not treat a generic narcotics prescription exception as a cannabis mode", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "ILLEGAL_CANNABIS_NARCOTIC_CONTROL",
          medical:
            "NONE_CANNABIS_SPECIFIC_PATIENT_ACCESS_UNPROVEN_GENERAL_NARCOTIC_PRESCRIPTION_MEDICINE_EXCEPTION_ONLY",
          enforcement: "STRICT_CRIMINAL_CONTROL",
        }),
      ),
    ).toBe("UNKNOWN");
  });

  test("requires affirmative limited-penalty evidence for decriminalization", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational:
            "ILLEGAL_CANNABIS_POSSESSION_AND_PERSONAL_USE_PUNISHABLE_ON_CONVICTION",
          medical: "NONE_NO_CANNABIS_PATIENT_ACCESS_PROVEN",
          enforcement: "STRICT_CRIMINAL_PENALTIES",
        }),
      ),
    ).toBe("UNKNOWN");
  });

  test("keeps claimant-only rows non-authoritative for truth-first color", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "UNDER_VISUALLY_VERIFIED_CLAIMANT_REGIME",
          medical: "UNDER_VISUALLY_VERIFIED_CLAIMANT_REGIME",
        }),
      ),
    ).toBe("UNKNOWN");
  });

  test("returns UNKNOWN for OFFICIAL_CONTEXT_ONLY rows, regardless of parsed signals", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow(
          {
            recreational: "LEGAL_ADULT_USE_REGULATED",
            medical: "REGULATED_PATIENT_ACCESS",
          },
          "OFFICIAL_CONTEXT_ONLY",
        ),
      ),
    ).toBe("UNKNOWN");
  });

  test("keeps a semantic criminal-control axis uncolored while medical access is unassessed", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow(
          {
            recreational: "ILLEGAL_CANNABIS_NARCOTIC_CONTROL_BY_CURRENT_APPLICABLE_PRIMARY_LAW",
            medical: "UNASSESSED_MEDICAL_PATIENT_ACCESS_AXIS",
            enforcement: "CRIMINAL_CONTROL",
          },
          "OFFICIAL_LEGAL_AXIS_PENDING_VISUAL_ACCEPTANCE",
        ),
      ),
    ).toBe("UNKNOWN");
  });

  test("does not treat proposal-only audit prose as a non-current legal clause", () => {
    const truth = deriveOfficialTruthColor({
      sourceCoverage: "OFFICIAL_LEGAL_AXIS_PENDING_VISUAL_ACCEPTANCE",
      officialStatus: {
        recreational: "ILLEGAL_CANNABIS_NARCOTIC_CONTROL_BY_CURRENT_APPLICABLE_PRIMARY_LAW",
        medical: "UNASSESSED_MEDICAL_PATIENT_ACCESS_AXIS",
        enforcement: "CRIMINAL_CONTROL",
      },
      legalEvidenceText: "Proposal-only audit evidence; strict visual acceptance remains pending.",
    });
    expect(truth.color).toBe("UNKNOWN");
    expect(truth.ruleId).toBe("OFFICIAL_STATUS_INDETERMINATE");
  });

  test("returns UNKNOWN for mixed federal/state jurisdictional signals", () => {
    expect(
      deriveOfficialLawMapCategory(
        asOfficialRow({
          recreational: "LEGAL_ADULT_USE_REGULATED; FEDERAL",
          medical: "REGULATED_PATIENT_ACCESS; STATE_SCOPE",
        }),
      ),
    ).toBe("UNKNOWN");
  });
});
