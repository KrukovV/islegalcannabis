import type { OfficialSourceKind } from "./officialLinkOwnershipTypes.ts";

export const GLOBAL_OFFICIAL_DOMAINS = new Set([
  "un.org",
  "treaties.un.org",
  "unodc.org",
  "incb.org",
  "europa.eu",
  "emcdda.europa.eu"
]);

export const MANUAL_DOMAIN_OWNERS: Record<
  string,
  { geos: string[]; scope: "country" | "state" | "territory" | "global" | "multi_geo"; active: boolean; basis: "manual" | "treaty_mapping" }
> = {
  "gov.uk": { geos: ["GB"], scope: "country", active: true, basis: "manual" },
  "service.gov.uk": { geos: ["GB"], scope: "country", active: true, basis: "manual" },
  "gov.wales": { geos: ["GB"], scope: "country", active: true, basis: "manual" },
  "gov.scot": { geos: ["GB"], scope: "country", active: true, basis: "manual" },
  "northernireland.gov.uk": { geos: ["GB"], scope: "country", active: true, basis: "manual" },
  "canada.ca": { geos: ["CA"], scope: "country", active: true, basis: "manual" },
  "australia.gov.au": { geos: ["AU"], scope: "country", active: true, basis: "manual" },
  "my.gov.au": { geos: ["AU"], scope: "country", active: true, basis: "manual" },
  "state.gov": { geos: ["US"], scope: "country", active: true, basis: "manual" },
  "usa.gov": { geos: ["US"], scope: "country", active: true, basis: "manual" },
  "login.gov": { geos: ["US"], scope: "country", active: true, basis: "manual" },
  "ssa.gov": { geos: ["US"], scope: "country", active: true, basis: "manual" },
  "irs.gov": { geos: ["US"], scope: "country", active: true, basis: "manual" },
  "fda.gov": { geos: ["US"], scope: "country", active: true, basis: "manual" },
  "studentaid.gov": { geos: ["US"], scope: "country", active: true, basis: "manual" },
  "court.gov": { geos: ["US"], scope: "country", active: true, basis: "manual" },
  "courts.gov": { geos: ["US"], scope: "country", active: true, basis: "manual" },
  "supremecourt.gov": { geos: ["US"], scope: "country", active: true, basis: "manual" },
  "legislation.gov.uk": { geos: ["GB"], scope: "country", active: true, basis: "manual" },
  "rks-gov.net": { geos: ["XK"], scope: "country", active: true, basis: "manual" },
  "treaties.un.org": { geos: [], scope: "global", active: false, basis: "treaty_mapping" },
  "un.org": { geos: [], scope: "global", active: false, basis: "treaty_mapping" },
  "unodc.org": { geos: [], scope: "global", active: false, basis: "treaty_mapping" },
  "incb.org": { geos: [], scope: "global", active: false, basis: "treaty_mapping" },
  "europa.eu": { geos: [], scope: "global", active: false, basis: "treaty_mapping" },
  "emcdda.europa.eu": { geos: [], scope: "global", active: false, basis: "treaty_mapping" }
};

export const US_STATE_DOMAIN_RULES: Array<{ pattern: RegExp; geo: string }> = [
  { pattern: /(^|\.)ca\.gov$/, geo: "US-CA" },
  { pattern: /(^|\.)mass\.gov$/, geo: "US-MA" },
  { pattern: /(^|\.)cannabis\.illinois\.gov$/, geo: "US-IL" },
  { pattern: /(^|\.)cannabis\.ny\.gov$/, geo: "US-NY" },
  { pattern: /(^|\.)cannabis\.nv\.gov$/, geo: "US-NV" },
  { pattern: /(^|\.)azdhs\.gov$/, geo: "US-AZ" },
  { pattern: /(^|\.)cannabis\.delaware\.gov$/, geo: "US-DE" },
  { pattern: /(^|\.)odh\.ohio\.gov$/, geo: "US-OH" },
  { pattern: /(^|\.)georgia\.gov$/, geo: "US-GA" }
];

export function inferSourceKind(domain: string): OfficialSourceKind {
  if (GLOBAL_OFFICIAL_DOMAINS.has(domain)) return "treaty_body";
  if (/parl|parliament|senate|congress|assembly/.test(domain)) return "parliament";
  if (/court|justice|judicial|tribunal/.test(domain)) return "court";
  if (/health|sante|salud|sanidad|ministry|ministerio|ministere|behdasht/.test(domain)) return "ministry";
  if (/fda|dea|tga|fimea|lakemedelsverket|bfarm|cofepris|ansm/.test(domain)) return "regulator";
  if (/legislation|finlex|gesetze|gazette|publishing/.test(domain)) return "official_publication";
  if (/gov|gob|gv|gouv|government|admin|bund|statcan|canada\.ca|belarus\.by/.test(domain)) return "government";
  return "other_official";
}
