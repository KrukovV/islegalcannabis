import { buildEvidencePassportCollection, renderEvidencePassportEmbedHtml, renderEvidencePassportPrintHtml, sha256EvidencePayload } from "./evidencePassport";

export type EvidenceDeliveryManifestEntry = {
  geo: string;
  territory: string;
  canonicalProjectionVersion: string;
  artifacts: {
    json: { path: string; sha256: string };
    embed: { path: string; sha256: string };
    printPdf: { path: string; sha256: string; delivery: "PRINT_HTML_SAVE_AS_PDF" };
  };
};

export type EvidenceDeliveryManifest = {
  schemaVersion: 1;
  localOnly: true;
  canonicalProjectionVersion: string;
  generatedAt: string;
  geoCount: 307;
  entries: EvidenceDeliveryManifestEntry[];
  manifestSha256: string;
};

export function buildEvidenceDeliveryManifest(): EvidenceDeliveryManifest {
  const { passports, version } = buildEvidencePassportCollection();
  if (passports.length !== 307) throw new Error(`EVIDENCE_DELIVERY_MANIFEST_UNIVERSE_MISMATCH=${passports.length}`);
  const entries = passports.map((passport): EvidenceDeliveryManifestEntry => ({
    geo: passport.geo,
    territory: passport.territory,
    canonicalProjectionVersion: passport.integrity.canonicalProjectionVersion,
    artifacts: {
      json: {
        path: passport.delivery.jsonExport,
        sha256: sha256EvidencePayload(passport)
      },
      embed: {
        path: passport.delivery.embedCard,
        sha256: sha256EvidencePayload(renderEvidencePassportEmbedHtml(passport))
      },
      printPdf: {
        path: passport.delivery.printDocument,
        sha256: sha256EvidencePayload(renderEvidencePassportPrintHtml(passport)),
        delivery: "PRINT_HTML_SAVE_AS_PDF"
      }
    }
  }));
  const unsigned = {
    schemaVersion: 1 as const,
    localOnly: true as const,
    canonicalProjectionVersion: version.id,
    generatedAt: version.generatedAt,
    geoCount: 307 as const,
    entries
  };
  return { ...unsigned, manifestSha256: sha256EvidencePayload(unsigned) };
}
