function normalizeCode(value: string) {
  return String(value || "").trim().toUpperCase();
}

const SUPPLEMENTAL_ADJACENCY: Record<string, string[]> = {
  DEU: ["NLD", "BEL", "LUX", "FRA", "CHE", "AUT", "CZE", "POL", "DNK"],
  NLD: ["DEU", "BEL"],
  BEL: ["NLD", "DEU", "LUX", "FRA"],
  FRA: ["BEL", "LUX", "DEU", "CHE", "ITA", "ESP", "AND", "MCO"],
  POL: ["DEU", "CZE", "SVK", "UKR", "BLR", "LTU", "RUS"],
  CZE: ["DEU", "POL", "SVK", "AUT"],
  AUT: ["DEU", "CZE", "SVK", "HUN", "SVN", "ITA", "CHE", "LIE"],
  CHE: ["DEU", "FRA", "ITA", "AUT", "LIE"],
  IRN: ["IRQ", "TUR", "ARM", "AZE", "TKM", "AFG", "PAK"],
  ARE: ["OMN", "SAU"],
  OMN: ["ARE", "SAU", "YEM"],
  SAU: ["ARE", "OMN", "YEM", "JOR", "IRQ", "KWT", "QAT", "ARE"],
  THA: ["KHM", "LAO", "MMR", "MYS"],
  ESP: ["PRT", "FRA", "AND", "GIB", "MAR"],
  PRT: ["ESP", "MAR"]
};

export function getSupplementalAdjacency(code: string) {
  return (SUPPLEMENTAL_ADJACENCY[normalizeCode(code)] || []).map(normalizeCode);
}
