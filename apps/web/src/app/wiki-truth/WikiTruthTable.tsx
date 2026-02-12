"use client";

import { useMemo, useState } from "react";
import { renderNotesFragments } from "../../lib/wikiNotesRender.mjs";
import { statusColorKey, statusLabelRu, statusShortRu, type TruthLevel } from "@/lib/statusUi";
import { explainSSOT } from "@/lib/ssotExplain";

export type WikiTruthRow = {
  geoKey: string;
  country: string;
  recWiki: string;
  medWiki: string;
  recOur: string;
  medOur: string;
  notesWiki: string;
  notesOur: string;
  notesLen: number;
  notesQuality: string;
  wikiPageUrl: string;
  sources: Array<{ url?: string; title?: string; isOfficial?: boolean }>;
  officialSources: Array<{ url?: string; title?: string; isOfficial?: boolean }>;
  sourcesTruncated: boolean;
  officialSourcesTruncated: boolean;
  official: string;
  delta: string;
  flags: string[];
};

const STATUS_CLASS: Record<"green" | "yellow" | "red" | "gray", string> = {
  green: "s-legal",
  yellow: "s-decrim",
  red: "s-illegal",
  gray: "s-unknown"
};

function classForStatus(value: string, truthLevel: TruthLevel): string {
  const key = statusColorKey(truthLevel, value);
  return STATUS_CLASS[key];
}

function badgeText(value: string): string {
  return statusShortRu(value);
}

function hasFlag(flags: string[], flag: string): boolean {
  return flags.includes(flag);
}

function linkifyText(text: string) {
  const s = String(text || "");
  const re = /(https?:\/\/[^\s<>"')\]]+)/g;
  const parts = s.split(re);
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          return (
            <a key={`url-${index}`} href={part} target="_blank" rel="noreferrer">
              {part}
            </a>
          );
        }
        return <span key={`text-${index}`}>{part}</span>;
      })}
    </>
  );
}

function NotesCell({ text }: { text: string }) {
  const fragments = renderNotesFragments(text) as
    | Array<
        | { type: "text"; value: string }
        | { type: "link"; href: string; text: string }
      >
    | null;
  if (!fragments) return linkifyText(text);
  return (
    <>
      {fragments.map((part, index) => {
        if (part.type === "link") {
          return (
            <a
              key={`note-link-${index}`}
              href={part.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {part.text}
            </a>
          );
        }
        return (
          <span key={`note-text-${index}`}>{linkifyText(part.value)}</span>
        );
      })}
    </>
  );
}

export default function WikiTruthTable({ rows }: { rows: WikiTruthRow[] }) {
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [onlyMissingOfficial, setOnlyMissingOfficial] = useState(false);
  const [onlyMissingSources, setOnlyMissingSources] = useState(false);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (onlyMismatch && !hasFlag(row.flags, "STATUS_MISMATCH")) return false;
      if (onlyMissingOfficial && !hasFlag(row.flags, "OFFICIAL_SOURCES_MISSING")) return false;
      if (onlyMissingSources && !hasFlag(row.flags, "SOURCES_MISSING")) return false;
      return true;
    });
  }, [rows, onlyMismatch, onlyMissingOfficial, onlyMissingSources]);

  return (
    <div className="mt-4">
      <div className="legend">
        <div className="legendRow">
          <span className={`pill ${classForStatus("Legal", "OFFICIAL")}`}>Legal</span>
          <span className={`pill ${classForStatus("Decrim", "OFFICIAL")}`}>Decrim</span>
          <span className={`pill ${classForStatus("Illegal", "OFFICIAL")}`}>Illegal</span>
          <span className={`pill ${classForStatus("Unenforced", "OFFICIAL")}`}>Unenforced</span>
          <span className={`pill ${classForStatus("Limited", "OFFICIAL")}`}>Limited</span>
          <span className={`pill ${classForStatus("Unknown", "OFFICIAL")}`}>{statusLabelRu("Unknown")}</span>
        </div>
        <div className="legendRow text">
          <span className="flag">STATUS_MISMATCH</span>
          <span className="flag">OFFICIAL_SOURCES_MISSING</span>
          <span className="flag">SOURCES_MISSING</span>
          <span className="flag">WIKI_NOTES_MISSING</span>
        </div>
      </div>
      <div className="filters">
        <label className="filterItem">
          <input
            type="checkbox"
            checked={onlyMismatch}
            onChange={(event) => setOnlyMismatch(event.target.checked)}
          />
          Only mismatches
        </label>
        <label className="filterItem">
          <input
            type="checkbox"
            checked={onlyMissingOfficial}
            onChange={(event) => setOnlyMissingOfficial(event.target.checked)}
          />
          Only missing official
        </label>
        <label className="filterItem">
          <input
            type="checkbox"
            checked={onlyMissingSources}
            onChange={(event) => setOnlyMissingSources(event.target.checked)}
          />
          Only missing sources
        </label>
        <span className="results">{filteredRows.length} results</span>
      </div>
      <div className="tableWrap">
        <table className="truthTable">
          <thead>
            <tr>
              <th className="stickyHead stickyCol1">ISO2/Geo</th>
              <th className="stickyHead stickyCol2">Country</th>
              <th className="stickyHead">Rec (Wiki)</th>
              <th className="stickyHead">Med (Wiki)</th>
              <th className="stickyHead">Rec (Our)</th>
              <th className="stickyHead">Med (Our)</th>
              <th className="stickyHead">Надёжность</th>
              <th className="stickyHead colWide">Notes (Wiki)</th>
              <th className="stickyHead colWide">Notes (Our)</th>
              <th className="stickyHead">NotesLen</th>
              <th className="stickyHead">NotesQuality</th>
              <th className="stickyHead">Wiki Page</th>
              <th className="stickyHead colWide">Sources (Our)</th>
              <th className="stickyHead colWide">Official Sources</th>
              <th className="stickyHead">Official</th>
              <th className="stickyHead">Delta</th>
              <th className="stickyHead">MismatchFlags</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const hasMismatch = hasFlag(row.flags, "STATUS_MISMATCH");
              const missingOfficial = hasFlag(row.flags, "OFFICIAL_SOURCES_MISSING");
              const missingSources = hasFlag(row.flags, "SOURCES_MISSING");
              const missingWikiNotes = hasFlag(row.flags, "WIKI_NOTES_MISSING");
              const missingWikiPage = hasFlag(row.flags, "WIKI_PAGE_MISSING");
              const rowTint = hasMismatch ? "rowTint" : "";
              const truthLevel: TruthLevel =
                row.officialSources.length > 0 ? "WIKI_CORROBORATED" : "WIKI_ONLY";
              const explain = explainSSOT({
                truthLevel,
                officialLinksCount: row.officialSources.length,
                recEffective: row.recOur,
                medEffective: row.medOur,
                reasons: row.flags
              });

              return (
                <tr key={`${row.country}-${row.geoKey}`} className={rowTint}>
                  <td className="stickyCol1 stickyCell">{row.geoKey}</td>
                  <td className="stickyCol2 stickyCell">{row.country}</td>
                  <td className={hasMismatch ? "cellMismatch" : ""}>
                    <span className={`pill ${classForStatus(row.recWiki, truthLevel)}`}>
                      {badgeText(row.recWiki)}
                    </span>
                  </td>
                  <td className={hasMismatch ? "cellMismatch" : ""}>
                    <span className={`pill ${classForStatus(row.medWiki, truthLevel)}`}>
                      {badgeText(row.medWiki)}
                    </span>
                  </td>
                  <td className={hasMismatch ? "cellMismatch" : ""}>
                    <span className={`pill ${classForStatus(row.recOur, truthLevel)}`}>
                      {badgeText(row.recOur)}
                    </span>
                  </td>
                  <td className={hasMismatch ? "cellMismatch" : ""}>
                    <span className={`pill ${classForStatus(row.medOur, truthLevel)}`}>
                      {badgeText(row.medOur)}
                    </span>
                  </td>
                  <td>{explain.reliabilityText}</td>
                  <td className={`colWide ${missingWikiNotes ? "cellMissing" : ""}`}>
                    <details>
                      <summary className="summaryClamp">
                        <NotesCell text={row.notesWiki} />
                      </summary>
                      <div className="expandedText">
                        <NotesCell text={row.notesWiki} />
                      </div>
                    </details>
                  </td>
                  <td className="colWide">
                    <details>
                      <summary className="summaryClamp">
                        <NotesCell text={row.notesOur} />
                      </summary>
                      <div className="expandedText">
                        <NotesCell text={row.notesOur} />
                      </div>
                    </details>
                  </td>
                  <td>{row.notesLen}</td>
                  <td>{row.notesQuality}</td>
                  <td className={missingWikiPage ? "cellMissing" : ""}>
                    {row.wikiPageUrl !== "-" ? (
                      <a
                        href={row.wikiPageUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="link"
                      >
                        {row.wikiPageUrl}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className={`colWide ${missingSources ? "cellMissing" : ""}`}>
                    {row.sources.length ? (
                      <div className="linkList">
                        {row.sources.slice(0, 2).map((source) => {
                          const url = source.url || source.title || "";
                          return (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="link"
                            >
                              {url}
                              {source.isOfficial ? " OFFICIAL" : ""}
                            </a>
                          );
                        })}
                        {row.sources.length > 2 && (
                          <span className="muted">+{row.sources.length - 2}</span>
                        )}
                        {row.sourcesTruncated && <span className="muted">TRUNCATED</span>}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className={`colWide ${missingOfficial && row.official === "yes" ? "cellMismatch" : ""}`}>
                    {row.officialSources.length ? (
                      <div className="linkList">
                        {row.officialSources.slice(0, 2).map((source) => {
                          const url = source.url || source.title || "";
                          return (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="link"
                            >
                              {url} OFFICIAL
                            </a>
                          );
                        })}
                        {row.officialSources.length > 2 && (
                          <span className="muted">+{row.officialSources.length - 2}</span>
                        )}
                        {row.officialSourcesTruncated && <span className="muted">TRUNCATED</span>}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className={missingOfficial && row.official === "yes" ? "cellMismatch" : ""}>
                    {row.official}
                  </td>
                  <td className={hasMismatch ? "cellMismatch" : ""}>{row.delta}</td>
                  <td className={hasMismatch ? "cellMismatch" : ""}>
                    {row.flags.length ? row.flags.join(",") : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .tableWrap {
          overflow-x: auto;
          max-width: 100%;
          -webkit-overflow-scrolling: touch;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #ffffff;
        }
        .truthTable {
          width: max-content;
          min-width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.875rem;
          --bg: #ffffff;
          --col1: 90px;
          --col2: 220px;
        }
        th,
        td {
          padding: 6px 8px;
          border-bottom: 1px solid #e5e7eb;
          border-right: 1px solid #e5e7eb;
          vertical-align: top;
          background: var(--bg);
        }
        thead th {
          position: sticky;
          top: 0;
          z-index: 5;
          background: #f8fafc;
        }
        .stickyCol1 {
          position: sticky;
          left: 0;
          min-width: var(--col1);
          max-width: var(--col1);
          z-index: 4;
          background: #ffffff;
        }
        .stickyCol2 {
          position: sticky;
          left: var(--col1);
          min-width: var(--col2);
          max-width: var(--col2);
          z-index: 4;
          background: #ffffff;
        }
        .stickyHead.stickyCol1,
        .stickyHead.stickyCol2 {
          z-index: 6;
          background: #f8fafc;
        }
        .stickyCell {
          background: #ffffff;
        }
        .colWide {
          max-width: 520px;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .summaryClamp {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          cursor: pointer;
        }
        .expandedText {
          margin-top: 6px;
          white-space: pre-wrap;
        }
        .pill {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
          border: 1px solid transparent;
        }
        .s-legal {
          background: #dcfce7;
          color: #14532d;
          border-color: #86efac;
        }
        .s-decrim {
          background: #dbeafe;
          color: #1e3a8a;
          border-color: #93c5fd;
        }
        .s-illegal {
          background: #fee2e2;
          color: #7f1d1d;
          border-color: #fecaca;
        }
        .s-unenforced {
          background: #fef3c7;
          color: #92400e;
          border-color: #fcd34d;
        }
        .s-limited {
          background: #f3e8ff;
          color: #5b21b6;
          border-color: #ddd6fe;
        }
        .s-unknown {
          background: #f1f5f9;
          color: #334155;
          border-color: #cbd5f5;
        }
        .cellMismatch {
          outline: 2px solid #ef4444;
          outline-offset: -2px;
          background: #fef2f2;
        }
        .cellMissing {
          outline: 2px dashed #f97316;
          outline-offset: -2px;
          background: #fff7ed;
        }
        .rowTint {
          background: #fff7f7;
        }
        .link {
          color: #1d4ed8;
          text-decoration: underline;
        }
        .linkList {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .muted {
          color: #6b7280;
          font-size: 0.75rem;
        }
        .legend {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 8px 0;
        }
        .legendRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .legendRow.text {
          font-size: 0.75rem;
          color: #6b7280;
        }
        .flag {
          padding: 2px 6px;
          border: 1px dashed #cbd5f5;
          border-radius: 6px;
          background: #f8fafc;
        }
        .filters {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-bottom: 10px;
          font-size: 0.85rem;
        }
        .filterItem {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .results {
          color: #475569;
        }
      `}</style>
    </div>
  );
}
