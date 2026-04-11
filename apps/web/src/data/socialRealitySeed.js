export const SOCIAL_REALITY_SEED = {
  MA: {
    signals: {
      tolerated: true,
      widely_used: true,
      low_enforcement: true,
      not_prosecuted_small_amount: false
    },
    confidence_score: 0.66,
    confidence_reason: "mixed_conflict",
    notes: ["informal_tolerance_zones", "widely_used", "police_non_priority_area"],
    summary:
      "Cannabis remains illegal in Morocco, but informal tolerance zones and low-enforcement cultivation signals are widely reported."
  },
  MM: {
    signals: {
      tolerated: false,
      widely_used: false,
      low_enforcement: true,
      not_prosecuted_small_amount: false
    },
    confidence_score: 0.58,
    confidence_reason: "signal_only",
    notes: ["enforcement_varies_by_region", "police_non_priority_area"],
    summary:
      "Cannabis remains illegal in Myanmar, but enforcement signals are inconsistent and can be weak outside headline crackdowns."
  },
  NP: {
    signals: {
      tolerated: false,
      widely_used: true,
      low_enforcement: false,
      not_prosecuted_small_amount: false
    },
    confidence_score: 0.57,
    confidence_reason: "signal_only",
    notes: ["event_based", "tourism_tolerated_use"],
    summary:
      "Cannabis remains illegal in Nepal, but event-based and cultural tolerance signals still appear around specific contexts."
  },
  LB: {
    signals: {
      tolerated: false,
      widely_used: false,
      low_enforcement: true,
      not_prosecuted_small_amount: false
    },
    confidence_score: 0.57,
    confidence_reason: "mixed_conflict",
    notes: ["enforcement_varies_by_region", "informal_tolerance_zones"],
    summary:
      "Cannabis remains illegal in Lebanon for recreational use, but enforcement varies and cultivation tolerance signals persist in some areas."
  },
  ID: {
    signals: {
      tolerated: false,
      widely_used: false,
      low_enforcement: false,
      not_prosecuted_small_amount: false
    },
    confidence_score: 0.28,
    confidence_reason: "signal_only",
    notes: ["tourism_tolerated_use"],
    summary:
      "Cannabis remains illegal in Indonesia and strong enforcement dominates, with only weak tourism-related tolerance signals."
  },
  JP: {
    signals: {
      tolerated: false,
      widely_used: false,
      low_enforcement: false,
      not_prosecuted_small_amount: false
    },
    confidence_score: 0.18,
    confidence_reason: "signal_only",
    notes: [],
    summary:
      "Cannabis remains illegal in Japan and social-reality signals stay weak compared with formal enforcement."
  },
  NG: {
    signals: {
      tolerated: false,
      widely_used: true,
      low_enforcement: true,
      not_prosecuted_small_amount: false
    },
    confidence_score: 0.59,
    confidence_reason: "mixed_conflict",
    notes: ["widely_used", "police_non_priority_area"],
    summary:
      "Cannabis remains illegal in Nigeria, but urban usage and low-priority enforcement signals appear in practice."
  },
  IN: {
    signals: {
      tolerated: false,
      widely_used: true,
      low_enforcement: true,
      not_prosecuted_small_amount: false
    },
    confidence_score: 0.61,
    confidence_reason: "mixed_conflict",
    notes: ["enforcement_varies_by_region", "event_based", "tourism_tolerated_use"],
    summary:
      "Cannabis rules remain restrictive in India overall, but enforcement varies by region and social tolerance persists in specific contexts."
  }
};

