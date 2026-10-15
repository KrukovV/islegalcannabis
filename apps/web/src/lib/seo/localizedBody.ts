import catalogJson from "./localizedBody.catalog.json";
import { bodySourceSha256, countryBodySource, countryBodyTexts, type CountryBodySource } from "./countryBodySource";
import type { CountryPageData } from "@/lib/countryPageStorage";
import type { TruthMapCountryPageProjection } from "@/truth-map/truthMapCountryPage";
import type { SeoLocale } from "./wikiLocaleContent";

type Binding = {
  geo: string; locale: string; sourceSha256: string; translationSha256: string;
  passportVersionId: string; passportPayloadSha256: string;
  retainedCitationIdentities: string[]; originalFragmentSha256: string;
  scopeSha256: string; disclaimerSha256: string;
};
type EditorialEvent = {
  state: string;
  localisationId: string; binding: Binding; previousEventSha256: string;
  eventId: string; eventSha256: string; draftEventId?: string;
  approvedEventId?: string; createdAt?: string; approvedAt?: string;
  supersededAt?: string;
};
type Catalog = {
  schemaVersion: number; sharedSources: string[];
  entries: Record<string, Partial<Record<SeoLocale, string>>>;
  events: EditorialEvent[];
};

/** Replays the immutable public export. It never reads or changes the local audit registry. */
export function approvedBodyLocalisations(catalog: Catalog) {
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.events) || !Array.isArray(catalog.sharedSources) || !catalog.entries) throw new Error("SEO_LOCALISATION_SCHEMA");
  let previous = "GENESIS";
  const states = new Map<string, { draft: EditorialEvent; approval?: EditorialEvent; superseded?: boolean }>();
  for (const event of catalog.events) {
    const unsigned = Object.fromEntries(Object.entries(event).filter(([key]) => key !== "eventId" && key !== "eventSha256"));
    const hash = bodySourceSha256(unsigned);
    if (event.eventSha256 !== hash || event.eventId !== `SEOLOC-${event.state}-${hash.slice(0, 24)}` || event.previousEventSha256 !== previous) {
      throw new Error("SEO_LOCALISATION_CHAIN_TAMPERED");
    }
    previous = hash;
    const time = event.createdAt || event.approvedAt || event.supersededAt;
    if (!time || !Number.isFinite(Date.parse(time)) || Date.parse(time) > Date.now() + 60_000) throw new Error("SEO_LOCALISATION_EVENT_TIME");
    const state = states.get(event.localisationId);
    if (event.state === "DRAFT") {
      if (state || !event.createdAt || !Number.isFinite(Date.parse(event.createdAt))) throw new Error("SEO_LOCALISATION_DUPLICATE_DRAFT");
      states.set(event.localisationId, { draft: event });
    } else {
      if (!state || bodySourceSha256(state.draft.binding) !== bodySourceSha256(event.binding)) throw new Error("SEO_LOCALISATION_BINDING_MISMATCH");
      if (event.state === "APPROVED") {
        if (state.approval || state.superseded || event.draftEventId !== state.draft.eventId || !event.approvedAt || !Number.isFinite(Date.parse(event.approvedAt)) || Date.parse(event.approvedAt) < Date.parse(state.draft.createdAt!)) {
          throw new Error("SEO_LOCALISATION_INVALID_APPROVAL");
        }
        const b = event.binding;
        if (!b.passportVersionId || !b.retainedCitationIdentities.length || ![b.sourceSha256, b.translationSha256, b.passportPayloadSha256, b.originalFragmentSha256, b.scopeSha256, b.disclaimerSha256, ...b.retainedCitationIdentities].every((s) => /^[a-f0-9]{64}$/.test(s))) {
          throw new Error("SEO_LOCALISATION_SOURCE_IDENTITY_MISSING");
        }
        state.approval = event;
      } else if (event.state === "SUPERSEDED") {
        if (!state.approval || state.superseded || event.approvedEventId !== state.approval.eventId || Date.parse(time) < Date.parse(state.approval.approvedAt!)) throw new Error("SEO_LOCALISATION_INVALID_SUPERSEDE");
        state.superseded = true;
      } else throw new Error("SEO_LOCALISATION_INVALID_STATE");
    }
  }
  const approved = new Map<string, Binding>();
  for (const state of states.values()) if (state.approval && !state.superseded) {
    const binding = state.approval.binding;
    const key = `${binding.geo}:${binding.locale}`;
    if (approved.has(key)) throw new Error("SEO_LOCALISATION_DUPLICATE_ACTIVE");
    approved.set(key, binding);
  }
  return approved;
}

export function bodyTranslationForSource(source: CountryBodySource, locale: SeoLocale, catalog: Catalog = catalogJson as Catalog) {
  const identity = (text: string) => text;
  if (locale === "en") return { current: true, translate: identity };
  let binding: Binding | undefined;
  try { binding = approvedBodyLocalisations(catalog).get(`${source.geo}:${locale}`); } catch { /* Untrusted export cannot replace current source text. */ }
  if (!binding) return { current: false, translate: identity };
  const required = [...new Set([...countryBodyTexts(source), ...catalog.sharedSources])].sort();
  const current = Boolean(binding
    && binding.sourceSha256 === bodySourceSha256(source)
    && binding.originalFragmentSha256 === bodySourceSha256(source.current.citations.map((c) => c.quote))
    && required.every((s) => Boolean(catalog.entries[s]?.[locale]))
    && binding.translationSha256 === bodySourceSha256(required.map((s) => [s, catalog.entries[s]?.[locale]])));
  return { current, translate: current ? (text: string) => catalog.entries[text]?.[locale] || text : identity };
}

export type CountryBodyTranslation = ReturnType<typeof bodyTranslationForSource>;

export function getCountryBodyTranslation(data: CountryPageData, projection: TruthMapCountryPageProjection, locale: SeoLocale) {
  return bodyTranslationForSource(countryBodySource(data, projection), locale);
}

export function staleTranslationNotice(locale: SeoLocale) {
  return (catalogJson.entries as Catalog["entries"])["Translation unavailable for updated source text; the current original is shown."]?.[locale];
}
