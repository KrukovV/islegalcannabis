export function buildEvidenceFromFacts(facts, snapshotPath, contentHash) {
  const items = Array.isArray(facts?.evidence) ? facts.evidence : [];
  return items
    .map((item) => {
      const kind = item?.kind || item?.type;
      const ref = item?.ref || "";
      const quote = String(item?.quote || "").slice(0, 240);
      const hasRef = Boolean(ref && String(ref).trim());
      if (!kind) return null;
      if (!quote && !hasRef) return null;
      if (kind === "pdf_page") {
        const match = String(ref).match(/page=(\d+)/i);
        const page = match ? match[1] : String(ref || "1");
        return {
          type: "pdf_page",
          page,
          anchor: null,
          quote,
          snapshot_path: snapshotPath,
          snapshot_ref: snapshotPath,
          content_hash: contentHash
        };
      }
      return {
        type: "html_anchor",
        page: null,
        anchor: String(ref || ""),
        quote,
        snapshot_path: snapshotPath,
        snapshot_ref: snapshotPath,
        content_hash: contentHash
      };
    })
    .filter(Boolean);
}
