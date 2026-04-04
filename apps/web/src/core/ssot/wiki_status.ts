import { readWikiClaim, readWikiRefs, readWikiOfficialEval, type WikiClaim } from "./ssot_reader";

export type WikiTrust = {
  official_count: number;
  total_count: number;
  official_matches: unknown[];
  non_official: unknown[];
  last_checked_at: string | null;
};

export type WikiBlock = {
  wiki_claim: {
    wiki_rec: string;
    wiki_med: string;
    notes_raw: string;
    notes_text: string;
    notes_sections_used: unknown[];
    notes_main_article: string;
    notes_rev: string;
    main_articles: unknown[];
    wiki_row_url: string | null;
    fetched_at: string | null;
  } | null;
  wiki_links: unknown[];
  links_trust: WikiTrust;
};

export function withWikiClaim<T extends { wiki_claim?: unknown; wiki_source?: string | null }>(
  profile: T,
  geoKey: string
): T {
  if (!profile) return profile;
  const claim = readWikiClaim(geoKey);
  if (!claim || typeof claim !== "object") return profile;
  const wikiRowUrl =
    typeof (claim as { wiki_row_url?: unknown }).wiki_row_url === "string"
      ? ((claim as { wiki_row_url?: string }).wiki_row_url ?? null)
      : null;
  const wikiSource = wikiRowUrl || profile.wiki_source;
  return { ...profile, wiki_claim: claim, wiki_source: wikiSource };
}

export function buildWikiBlock(geoKey: string): WikiBlock {
  const claim = readWikiClaim(geoKey);
  const wikiRefs = readWikiRefs(geoKey);
  const rawRefs = (claim as { wiki_refs?: unknown[] } | null)?.wiki_refs;
  const fallbackRefs: unknown[] = Array.isArray(rawRefs) ? rawRefs : [];
  const mergedRefs = wikiRefs.length ? wikiRefs : fallbackRefs;
  const notesSectionsUsed: unknown[] = Array.isArray((claim as { notes_sections_used?: unknown[] } | null)?.notes_sections_used)
    ? ((claim as { notes_sections_used?: unknown[] }).notes_sections_used ?? [])
    : [];
  const mainArticles: unknown[] = Array.isArray((claim as { main_articles?: unknown[] } | null)?.main_articles)
    ? ((claim as { main_articles?: unknown[] }).main_articles ?? [])
    : Array.isArray((claim as { notes_main_articles?: unknown[] } | null)?.notes_main_articles)
      ? ((claim as { notes_main_articles?: unknown[] }).notes_main_articles ?? [])
      : [];
  const wikiClaim: WikiBlock["wiki_claim"] = claim
    ? {
        wiki_rec: (claim as { wiki_rec?: string }).wiki_rec ?? "Unknown",
        wiki_med: (claim as { wiki_med?: string }).wiki_med ?? "Unknown",
        notes_raw: (claim as { notes_raw?: string }).notes_raw ?? "",
        notes_text: (claim as { notes_text?: string }).notes_text ?? "",
        notes_sections_used: notesSectionsUsed,
        notes_main_article: (claim as { notes_main_article?: string }).notes_main_article ?? "",
        notes_rev: (claim as { notes_rev?: string }).notes_rev ?? "",
        main_articles: mainArticles,
        wiki_row_url: (claim as { wiki_row_url?: string }).wiki_row_url ?? null,
        fetched_at: (claim as { fetched_at?: string }).fetched_at ?? null
      }
    : null;
  const officialEval = readWikiOfficialEval(geoKey) as
    | {
        official_count?: number;
        non_official_count?: number;
        total_refs?: number;
        official_matches?: unknown[];
        non_official?: unknown[];
        last_checked_at?: string;
      }
    | null;
  const totalCount =
    Number(officialEval?.total_refs || 0) ||
    Number((officialEval?.official_count || 0) + (officialEval?.non_official_count || 0)) ||
    mergedRefs.length;
  const trust: WikiTrust = {
    official_count: Number(officialEval?.official_count || 0) || 0,
    total_count: totalCount,
    official_matches: Array.isArray(officialEval?.official_matches)
      ? officialEval?.official_matches
      : [],
    non_official: Array.isArray(officialEval?.non_official) ? officialEval?.non_official : [],
    last_checked_at: officialEval?.last_checked_at ?? null
  };
  return { wiki_claim: wikiClaim, wiki_links: mergedRefs, links_trust: trust };
}

export function getWikiClaim(geoKey: string): WikiClaim | null {
  return readWikiClaim(geoKey);
}
