import { scoreUrl } from "../sources/trust";

export type ConfidenceInput = {
  extractedFields: string[];
  requiredCount: number;
  sourcesUsed: Array<{ url: string; weight: number }>;
  consistency: boolean;
  freshnessHours: number;
};

export type ConfidenceResult = {
  confidence: "low" | "medium" | "high";
  score: number;
  reasons: string[];
};

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const trustSum = input.sourcesUsed.reduce((acc, source) => {
    return acc + scoreUrl(source.url) * source.weight;
  }, 0);
  const base = Math.min(2.0, trustSum);
  const coverage = input.requiredCount
    ? Math.min(1, input.extractedFields.length / input.requiredCount)
    : 0;
  let score = (base / 2) * 40 + coverage * 40;

  if (input.consistency && input.sourcesUsed.length >= 2) {
    score += 10;
  }

  if (input.freshnessHours > 12) {
    score -= 15;
  }
  if (input.freshnessHours > 48) {
    score -= 10;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const officialCount = input.sourcesUsed.filter(
    (source) => scoreUrl(source.url) >= 0.9
  ).length;

  let confidence: ConfidenceResult["confidence"] = "low";
  if (score >= 75 && officialCount >= 2) {
    confidence = "high";
  } else if (score >= 50) {
    confidence = "medium";
  }

  const reasons = [
    `sourceScore=${base.toFixed(2)}`,
    `coverage=${Math.round(coverage * 100)}%`,
    `consistency=${input.consistency}`,
    `freshnessHours=${Math.round(input.freshnessHours)}`
  ];

  return { confidence, score, reasons };
}
