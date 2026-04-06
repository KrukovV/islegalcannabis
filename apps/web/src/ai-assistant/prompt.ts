import type { RagChunk } from "./types";

export function buildPrompt(input: {
  query: string;
  geoHint?: string;
  language?: string;
  context: RagChunk[];
  travelContext?: string;
  jurisdictionContext?: string;
}) {
  const context = input.context.map((chunk) => ({
    id: chunk.id,
    source: chunk.source,
    kind: chunk.kind,
    geo: chunk.geo ?? null,
    title: chunk.title,
    text: chunk.text
  }));

  return [
    "You are a cannabis culture + legality assistant.",
    "Answer with high-level explanations only.",
    `Answer in ${input.language || "en"}.`,
    "Do not give legal advice or instructions for breaking laws, transporting cannabis, or evading enforcement.",
    "Use the provided context first. If exact context is thin, answer with safe general knowledge instead of failing.",
    "",
    `Question: ${input.query}`,
    `Geo hint: ${input.geoHint || "none"}`,
    `Context: ${JSON.stringify(context)}`,
    input.jurisdictionContext ? `Jurisdiction context: ${input.jurisdictionContext}` : "",
    input.travelContext ? `Travel context: ${input.travelContext}` : ""
  ].join("\n");
}
