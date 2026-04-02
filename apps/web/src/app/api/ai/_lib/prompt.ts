import type { AiGeoContext } from "./retrieval";

export function buildAiSystemPrompt() {
  return [
    "You answer strictly based on provided legal data.",
    "If unknown, say unknown.",
    "Do not hallucinate.",
    "Do not add legal advice, compliance tips, or speculation.",
    "Prefer short factual answers."
  ].join(" ");
}

export function buildAiUserPrompt(query: string, context: AiGeoContext | null) {
  return [
    `Query: ${query}`,
    `Context: ${JSON.stringify(context, null, 2)}`,
    "Return a concise answer and mention when data is unknown."
  ].join("\n\n");
}
