export type ExtrasSeverity = "low" | "medium" | "high";

export type ExtrasCatalogItem = {
  key: string;
  title: string;
  whyMatters: string;
  userActionHint: string;
  severityHint: ExtrasSeverity;
};

export const EXTRAS_CATALOG: ExtrasCatalogItem[] = [
  {
    key: "public_use",
    title: "Public use",
    whyMatters: "Public consumption rules vary and can trigger penalties.",
    userActionHint: "Check official guidance for public spaces.",
    severityHint: "high"
  },
  {
    key: "driving",
    title: "Driving",
    whyMatters: "Driving rules are strict and often enforced separately.",
    userActionHint: "Review impaired-driving rules locally.",
    severityHint: "high"
  },
  {
    key: "purchase",
    title: "Purchase",
    whyMatters: "Purchase rules affect access and eligibility.",
    userActionHint: "Confirm eligibility and licensed outlets.",
    severityHint: "medium"
  },
  {
    key: "home_grow",
    title: "Home grow",
    whyMatters: "Home grow limits can be strict or prohibited.",
    userActionHint: "Verify local limits before growing.",
    severityHint: "medium"
  },
  {
    key: "cbd",
    title: "CBD",
    whyMatters: "CBD rules differ from cannabis legality.",
    userActionHint: "Check THC thresholds and product rules.",
    severityHint: "low"
  },
  {
    key: "edibles_vapes",
    title: "Edibles & vapes",
    whyMatters: "Product form restrictions vary by region.",
    userActionHint: "Check approved product categories.",
    severityHint: "medium"
  }
];

export const EXTRAS_PRIORITY = [
  "purchase",
  "retail_shops",
  "edibles",
  "vapes",
  "concentrates",
  "cbd",
  "paraphernalia",
  "medical_card",
  "home_grow_plants",
  "social_clubs",
  "hemp",
  "workplace",
  "testing_dui"
];
