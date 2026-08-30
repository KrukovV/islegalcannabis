const COLORS = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN"]);

function normalizeColor(value) {
  const color = String(value || "").trim().toUpperCase();
  return COLORS.has(color) ? color : null;
}

// A human-reviewed conclusion may explicitly state a color that contradicts a
// stale structured field. This parser reacts only to explicit truth/color
// conclusions, never to a bare color word inside a source fragment.
export function explicitConclusionTruthColor(...texts) {
  for (const rawText of texts) {
    const text = String(rawText || "");
    const match = text.match(
      /\b(?:independent\b[\s\S]{0,80}?\btruth\s*colou?r|truth\s*colou?r|proposal-only\s+(?:truth\s*)?(?:colou?r|result)|canonical\s+(?:truth\s*)?(?:colou?r|result))\s*(?:is|:|=)?\s*(GREEN|YELLOW|RED|UNKNOWN)\b/i,
    );
    const color = normalizeColor(match?.[1]);
    if (color) return color;
  }
  return null;
}

export function reconcileDeclaredIndependentTruth({ declaredColor, declaredRule, conclusions }) {
  const normalizedDeclaredColor = normalizeColor(declaredColor);
  const conclusionColor = explicitConclusionTruthColor(...(Array.isArray(conclusions) ? conclusions : []));
  if (conclusionColor && conclusionColor !== normalizedDeclaredColor) {
    return {
      color: conclusionColor,
      rule: `CONCLUSION_EXPLICIT_COLOR_CONSISTENCY_GUARD_${conclusionColor}`,
      corrected: true,
      previousColor: normalizedDeclaredColor,
    };
  }
  return {
    color: normalizedDeclaredColor,
    rule: String(declaredRule || "").trim(),
    corrected: false,
    previousColor: normalizedDeclaredColor,
  };
}
