import { createHash } from "node:crypto";

export function stableEvidenceJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableEvidenceJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableEvidenceJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256EvidencePayload(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : stableEvidenceJson(value)).digest("hex");
}
