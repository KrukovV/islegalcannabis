import type { CountryPageData } from "@/lib/countryPageStorage";

export type CountryIntentSection = {
  id: "buy" | "possession" | "tourists" | "airport" | "medical";
  heading: string;
  body: string;
};

function regionLabel(data: CountryPageData) {
  return data.name.split(" / ")[0] || data.name;
}

function sentenceCase(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildBuySection(data: CountryPageData): CountryIntentSection {
  const label = regionLabel(data);
  const sale = data.legal_model.distribution.scopes.sale;
  const distribution = data.legal_model.distribution.status;
  let body = `Cannabis retail is ${sentenceCase(distribution)} in ${label}.`;
  if (sale === "regulated") body = `Licensed or regulated cannabis sales exist in ${label}, but only inside the legal channels described in the normalized source data.`;
  if (sale === "tolerated") body = `Buying cannabis in ${label} is tolerated only in limited settings noted in the source data, not as a fully open legal market.`;
  if (sale === "illegal" || distribution === "illegal") body = `Buying cannabis in ${label} is not treated as a legal retail activity in the normalized source data.`;
  if (distribution === "mixed") body = `Buying cannabis in ${label} is mixed: some consumer-facing access is tolerated or regulated, while other sale or supply channels remain illegal.`;
  return {
    id: "buy",
    heading: `Can you buy cannabis in ${label}?`,
    body
  };
}

function buildPossessionSection(data: CountryPageData): CountryIntentSection {
  const label = regionLabel(data);
  const possessionLimit = data.facts.possession_limit;
  const rec = data.legal_model.recreational.status;
  const risk = data.legal_model.signals?.final_risk || "UNKNOWN";
  let body = `Personal possession in ${label} is modeled as ${sentenceCase(rec)} with ${sentenceCase(risk)} overall risk.`;
  if (possessionLimit) body += ` The stored facts say: ${possessionLimit}`;
  if (data.legal_model.signals?.penalties?.possession?.prison) body += " Prison exposure is explicitly detected for possession.";
  else if (data.legal_model.signals?.penalties?.possession?.arrest) body += " Arrest or detention exposure is explicitly detected for possession.";
  else if (data.legal_model.signals?.penalties?.possession?.fine) body += " Fine-based possession enforcement is explicitly detected.";
  return {
    id: "possession",
    heading: `Possession rules in ${label}`,
    body
  };
}

function buildTouristsSection(data: CountryPageData): CountryIntentSection {
  const label = regionLabel(data);
  const rec = data.legal_model.recreational.status;
  const risk = data.legal_model.signals?.final_risk || "UNKNOWN";
  const enforcement = data.legal_model.signals?.enforcement_level || "active";
  let body = `Tourists in ${label} should not assume the local market is open just because cannabis is ${sentenceCase(rec)} for some residents.`;
  if (risk === "HIGH_RISK") body = `Tourists in ${label} face high legal risk in the normalized model, including prison exposure signals.`;
  if (risk === "RESTRICTED") body = `Tourists in ${label} face restricted conditions: legal access is limited and enforcement can still apply even when everyday use appears common.`;
  if (enforcement === "rare" || enforcement === "unenforced") body += ` Enforcement is modeled as ${sentenceCase(enforcement)}, which softens practice but does not create a tourist exemption.`;
  return {
    id: "tourists",
    heading: "Is cannabis allowed for tourists?",
    body
  };
}

function buildAirportSection(data: CountryPageData): CountryIntentSection {
  const label = regionLabel(data);
  const importScope = data.legal_model.distribution.scopes.import;
  const traffickingScope = data.legal_model.distribution.scopes.trafficking;
  let body = `Airport and border handling in ${label} follows the import and trafficking signals in the legal model.`;
  if (importScope === "illegal") body = `Airport and border entry into ${label} is modeled as illegal for cannabis import. Carrying cannabis through customs or across the border is not treated as safe.`;
  else if (traffickingScope === "illegal") body = `Airport and transport risk in ${label} remains restricted because trafficking or transport-related supply signals stay illegal.`;
  else body += ` No explicit legal import channel is stored, so airport travel should be treated cautiously.`;
  if (data.facts.penalty) body += ` Stored fact: ${data.facts.penalty}`;
  return {
    id: "airport",
    heading: "Airport rules",
    body
  };
}

function buildMedicalSection(data: CountryPageData): CountryIntentSection {
  const label = regionLabel(data);
  const medical = data.legal_model.medical.status;
  const scope = data.legal_model.medical.scope;
  const override = data.legal_model.medical.override_reason;
  let body = `Medical cannabis in ${label} is modeled as ${sentenceCase(medical)} with scope ${sentenceCase(scope)}.`;
  if (medical === "LEGAL") body = `Medical cannabis access exists in ${label}, but it should be interpreted through the official program or prescription path reflected by the normalized model.`;
  if (medical === "LIMITED") body = `Medical cannabis in ${label} is limited rather than broadly legal, which usually means a narrower program than general adult-use access.`;
  if (medical === "ILLEGAL") body = `Medical cannabis is not broadly legal in ${label} in the current normalized model.`;
  if (override === "rec_implies_med_floor") body += " The medical floor was raised from raw wiki truth to keep the final model internally consistent.";
  return {
    id: "medical",
    heading: `Medical cannabis in ${label}`,
    body
  };
}

export function buildCountryIntentSections(data: CountryPageData): CountryIntentSection[] {
  return [
    buildBuySection(data),
    buildPossessionSection(data),
    buildTouristsSection(data),
    buildAirportSection(data),
    buildMedicalSection(data)
  ];
}
