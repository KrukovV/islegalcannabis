import type { CountryLinkRef, CountryPageData } from "@/lib/countryPageStorage";
import { getDisplayName } from "@/lib/countryNames";
import type { SeoLocale } from "@/lib/seo/i18n";

export type IntentId = "buy" | "possession" | "tourists" | "airport" | "medical";

export type RankedRelatedRegion = CountryLinkRef & {
  signal: "neighbor" | "cluster" | "legal_similarity";
  score: number;
};

export type CountryIntentSection = {
  id: IntentId;
  heading: string;
  body: string;
  strength: number;
  related_heading: string;
  related_regions: RankedRelatedRegion[];
};

type IntentSeed = {
  id: IntentId;
  heading: string;
  body: string;
  strength: number;
};

function t(locale: SeoLocale, copy: Record<SeoLocale, string>) {
  return copy[locale] || copy.en;
}

const INTENT_QUERY_PATTERNS: Record<IntentId, RegExp> = {
  buy: /\bbuy\b|\bpurchase\b|\bsale\b|\bdispensary\b|\blicensed\b/,
  possession: /\bpossess\b|\bpossession\b|\blimit\b|\bcarry\b/,
  tourists: /\btourist\b|\bvisitor\b|\bpublic use\b/,
  airport: /\bairport\b|\btransport\b|\bborder\b|\bfederal\b/,
  medical: /\bmedical\b|\bprescription\b|\bpatient\b/
};

function regionLabel(data: CountryPageData, locale: SeoLocale) {
  if (data.node_type === "country") {
    return getDisplayName(data.iso2, locale) || data.name.split(" / ")[0] || data.name;
  }
  return data.name.split(" / ")[0] || data.name;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").toLowerCase();
}

function clampStrength(value: number) {
  return Math.max(0, Math.min(1, value));
}

function detectIntentQuery(query: string | null | undefined): IntentId | null {
  const normalized = normalizeText(query);
  if (!normalized) return null;
  for (const [id, pattern] of Object.entries(INTENT_QUERY_PATTERNS) as Array<[IntentId, RegExp]>) {
    if (pattern.test(normalized)) return id;
  }
  return null;
}

function buildBuyIntent(data: CountryPageData, locale: SeoLocale): IntentSeed {
  const label = regionLabel(data, locale);
  const notes = normalizeText(`${data.notes_normalized} ${data.notes_raw}`);
  const sale = data.legal_model.distribution.scopes.sale;
  const distribution = data.legal_model.distribution.status;
  const licensed = /\bsale\b|\bdispensary\b|\blicensed\b/.test(notes);
  let strength = 0.2;
  let body = t(locale, {
    en: `Buying cannabis in ${label} remains illegal.`,
    de: `Der Kauf von Cannabis bleibt in ${label} illegal.`,
    es: `Comprar cannabis en ${label} sigue siendo ilegal.`,
    fr: `L'achat de cannabis reste illégal en ${label}.`,
    pt: `Comprar cannabis em ${label} continua ilegal.`,
    nl: `Cannabis kopen blijft in ${label} illegaal.`
  });

  if (sale === "regulated" || distribution === "regulated") {
    strength = 1;
    body = t(locale, {
      en: `Licensed cannabis sales are available in ${label}.`,
      de: `Lizenzierte Cannabis-Verkäufe sind in ${label} verfügbar.`,
      es: `Existen ventas autorizadas de cannabis en ${label}.`,
      fr: `Des ventes autorisées de cannabis existent en ${label}.`,
      pt: `Há venda licenciada de cannabis em ${label}.`,
      nl: `Vergunde cannabisverkoop is beschikbaar in ${label}.`
    });
  } else if (sale === "tolerated" || distribution === "tolerated" || distribution === "mixed" || distribution === "restricted" || licensed) {
    strength = 0.6;
    body = t(locale, {
      en: `Buying cannabis in ${label} depends on limited sale channels or local restrictions.`,
      de: `Der Kauf von Cannabis in ${label} hängt von begrenzten Kanälen oder lokalen Regeln ab.`,
      es: `Comprar cannabis en ${label} depende de canales limitados o restricciones locales.`,
      fr: `L'achat de cannabis en ${label} dépend de circuits limités ou de restrictions locales.`,
      pt: `Comprar cannabis em ${label} depende de canais limitados ou restrições locais.`,
      nl: `Cannabis kopen in ${label} hangt af van beperkte kanalen of lokale regels.`
    });
  }

  return {
    id: "buy",
    heading: t(locale, {
      en: `Can you buy cannabis in ${label}?`,
      de: `Kann man in ${label} Cannabis kaufen?`,
      es: `¿Se puede comprar cannabis en ${label}?`,
      fr: `Peut-on acheter du cannabis en ${label} ?`,
      pt: `É possível comprar cannabis em ${label}?`,
      nl: `Kun je cannabis kopen in ${label}?`
    }),
    body,
    strength: clampStrength(strength)
  };
}

function buildPossessionIntent(data: CountryPageData, locale: SeoLocale): IntentSeed {
  const label = regionLabel(data, locale);
  const possessionLimit = data.facts.possession_limit;
  const notes = normalizeText(`${data.notes_normalized} ${data.notes_raw}`);
  const penalties = data.legal_model.signals?.penalties;
  let strength = 0.4;
  let body = t(locale, {
    en: `Personal possession in ${label} remains restricted.`,
    de: `Der Eigenbesitz bleibt in ${label} eingeschränkt.`,
    es: `La posesión personal sigue restringida en ${label}.`,
    fr: `La possession personnelle reste restreinte en ${label}.`,
    pt: `A posse pessoal continua restrita em ${label}.`,
    nl: `Persoonlijk bezit blijft in ${label} beperkt.`
  });

  if (possessionLimit) {
    strength = 0.9;
    body = t(locale, {
      en: `Possession in ${label}: ${possessionLimit}`,
      de: `Besitz in ${label}: ${possessionLimit}`,
      es: `Posesión en ${label}: ${possessionLimit}`,
      fr: `Possession en ${label} : ${possessionLimit}`,
      pt: `Posse em ${label}: ${possessionLimit}`,
      nl: `Bezit in ${label}: ${possessionLimit}`
    });
  } else if (penalties?.possession?.prison) {
    strength = 0.7;
    body = t(locale, {
      en: `Personal possession in ${label} can lead to prison exposure.`,
      de: `Eigenbesitz in ${label} kann zu Haft führen.`,
      es: `La posesión personal en ${label} puede implicar prisión.`,
      fr: `La possession personnelle en ${label} peut exposer à la prison.`,
      pt: `A posse pessoal em ${label} pode levar à prisão.`,
      nl: `Persoonlijk bezit in ${label} kan tot gevangenisstraf leiden.`
    });
  } else if (penalties?.possession?.arrest || penalties?.possession?.fine || /\bpossession\b/.test(notes)) {
    strength = 0.4;
    body = t(locale, {
      en: `Personal possession in ${label} is limited by penalties or quantity rules.`,
      de: `Eigenbesitz in ${label} wird durch Strafen oder Mengenregeln begrenzt.`,
      es: `La posesión personal en ${label} está limitada por sanciones o reglas de cantidad.`,
      fr: `La possession personnelle en ${label} est limitée par des sanctions ou des seuils de quantité.`,
      pt: `A posse pessoal em ${label} é limitada por sanções ou regras de quantidade.`,
      nl: `Persoonlijk bezit in ${label} wordt begrensd door straffen of hoeveelheidsregels.`
    });
  }

  return {
    id: "possession",
    heading: t(locale, {
      en: `Possession rules in ${label}`,
      de: `Besitzregeln in ${label}`,
      es: `Reglas de posesión en ${label}`,
      fr: `Règles de possession en ${label}`,
      pt: `Regras de posse em ${label}`,
      nl: `Bezitregels in ${label}`
    }),
    body,
    strength: clampStrength(strength)
  };
}

function buildTouristsIntent(data: CountryPageData, locale: SeoLocale): IntentSeed {
  const label = regionLabel(data, locale);
  const notes = normalizeText(`${data.notes_normalized} ${data.notes_raw}`);
  const explicit = /\btourist\b|\bvisitor\b|\bpublic use\b/.test(notes);
  const scope = data.legal_model.recreational.scope;
  const risk = data.legal_model.signals?.final_risk || "UNKNOWN";
  const allowed = data.legal_model.recreational.status === "LEGAL";
  const strength = explicit ? (allowed ? 1 : 0.5) : 0.5;
  let body = t(locale, {
    en: `Tourists in ${label} should expect the same restricted cannabis rules as residents.`,
    de: `Touristen in ${label} sollten mit denselben eingeschränkten Regeln wie Einheimische rechnen.`,
    es: `Los turistas en ${label} deben esperar las mismas reglas restringidas que los residentes.`,
    fr: `Les touristes en ${label} doivent s'attendre aux mêmes règles restreintes que les résidents.`,
    pt: `Turistas em ${label} devem esperar as mesmas regras restritas que os residentes.`,
    nl: `Toeristen in ${label} moeten dezelfde beperkte regels verwachten als bewoners.`
  });

  if (risk === "HIGH_RISK") body = t(locale, {
    en: `Tourists in ${label} face high legal risk.`,
    de: `Touristen in ${label} tragen ein hohes rechtliches Risiko.`,
    es: `Los turistas en ${label} enfrentan un alto riesgo legal.`,
    fr: `Les touristes en ${label} font face à un risque juridique élevé.`,
    pt: `Turistas em ${label} enfrentam alto risco legal.`,
    nl: `Toeristen in ${label} lopen een hoog juridisch risico.`
  });
  else if (allowed && scope === "PERSONAL_USE") body = t(locale, {
    en: `Tourists in ${label} have access only where local personal-use rules allow it.`,
    de: `Touristen in ${label} haben nur dort Zugang, wo lokale Regeln zum Eigengebrauch es erlauben.`,
    es: `Los turistas en ${label} solo tienen acceso donde las reglas locales de uso personal lo permiten.`,
    fr: `Les touristes en ${label} n'ont accès que là où les règles locales d'usage personnel l'autorisent.`,
    pt: `Turistas em ${label} só têm acesso onde as regras locais de uso pessoal o permitem.`,
    nl: `Toeristen in ${label} hebben alleen toegang waar lokale regels voor eigen gebruik dat toestaan.`
  });
  else if (explicit) body = t(locale, {
    en: `Tourists in ${label} face the visitor or public-use limits stated in the source notes.`,
    de: `Für Touristen in ${label} gelten die Besucher- oder öffentlichen Nutzungsgrenzen aus den Quellen.`,
    es: `Los turistas en ${label} se enfrentan a los límites para visitantes o uso público indicados en las fuentes.`,
    fr: `Les touristes en ${label} sont soumis aux limites pour visiteurs ou usage public indiquées dans les sources.`,
    pt: `Turistas em ${label} enfrentam os limites para visitantes ou uso público descritos nas fontes.`,
    nl: `Toeristen in ${label} vallen onder de bezoekers- of openbare gebruiksbeperkingen uit de bronnotities.`
  });

  return {
    id: "tourists",
    heading: t(locale, {
      en: "Is cannabis allowed for tourists?",
      de: "Ist Cannabis für Touristen erlaubt?",
      es: "¿Está permitido el cannabis para turistas?",
      fr: "Le cannabis est-il autorisé pour les touristes ?",
      pt: "Cannabis é permitido para turistas?",
      nl: "Is cannabis toegestaan voor toeristen?"
    }),
    body,
    strength: clampStrength(strength)
  };
}

function buildAirportIntent(data: CountryPageData, locale: SeoLocale): IntentSeed {
  const label = regionLabel(data, locale);
  const notes = normalizeText(`${data.notes_normalized} ${data.notes_raw}`);
  const importIllegal = data.legal_model.distribution.scopes.import === "illegal";
  const traffickingIllegal = data.legal_model.distribution.scopes.trafficking === "illegal";
  const hasConflict = /\bairport\b|\btransport\b|\bfederal\b/.test(notes) || importIllegal || traffickingIllegal || data.parent_country?.code === "usa";
  const strength = hasConflict ? 1 : 0.3;
  let body = t(locale, {
    en: `Airport transport in ${label} remains restricted.`,
    de: `Flughafentransport in ${label} bleibt eingeschränkt.`,
    es: `El transporte por aeropuerto en ${label} sigue restringido.`,
    fr: `Le transport par aéroport en ${label} reste restreint.`,
    pt: `O transporte por aeroporto em ${label} continua restrito.`,
    nl: `Vervoer via luchthavens in ${label} blijft beperkt.`
  });

  if (data.parent_country?.code === "usa") {
    body = t(locale, {
      en: `Airport rules in ${label} remain restricted because federal law still conflicts with state-level cannabis access.`,
      de: `Flughafenregeln in ${label} bleiben eingeschränkt, weil Bundesrecht weiter mit dem Zugang auf Staatsebene kollidiert.`,
      es: `Las reglas aeroportuarias en ${label} siguen restringidas porque la ley federal todavía entra en conflicto con el acceso estatal.`,
      fr: `Les règles aéroportuaires en ${label} restent restreintes car le droit fédéral entre toujours en conflit avec l'accès au niveau de l'État.`,
      pt: `As regras aeroportuárias em ${label} continuam restritas porque a lei federal ainda conflita com o acesso estadual.`,
      nl: `Luchthavenregels in ${label} blijven beperkt omdat federale wet nog steeds botst met toegang op staatsniveau.`
    });
  } else if (importIllegal) {
    body = t(locale, {
      en: `Airport and border entry into ${label} remains illegal for cannabis import.`,
      de: `Die Einfuhr von Cannabis über Flughafen oder Grenze bleibt in ${label} illegal.`,
      es: `La entrada de cannabis por aeropuerto o frontera sigue siendo ilegal en ${label}.`,
      fr: `L'entrée de cannabis par aéroport ou frontière reste illégale en ${label}.`,
      pt: `A entrada de cannabis por aeroporto ou fronteira continua ilegal em ${label}.`,
      nl: `Invoer van cannabis via luchthaven of grens blijft in ${label} illegaal.`
    });
  } else if (traffickingIllegal) {
    body = t(locale, {
      en: `Airport and transport handling in ${label} remains restricted because trafficking or transport-related supply signals stay illegal.`,
      de: `Flughafen- und Transportwege in ${label} bleiben eingeschränkt, weil Handel und transportbezogene Lieferketten illegal bleiben.`,
      es: `El manejo en aeropuertos y transporte en ${label} sigue restringido porque el tráfico y el suministro ligado al transporte siguen siendo ilegales.`,
      fr: `Les aéroports et le transport en ${label} restent restreints car le trafic et l'approvisionnement liés au transport demeurent illégaux.`,
      pt: `Aeroportos e transporte em ${label} continuam restritos porque tráfico e fornecimento ligados ao transporte permanecem ilegais.`,
      nl: `Luchthavens en transport in ${label} blijven beperkt omdat handel en vervoersgerelateerde bevoorrading illegaal blijven.`
    });
  }

  return {
    id: "airport",
    heading: t(locale, {
      en: "Airport rules",
      de: "Flughafenregeln",
      es: "Reglas aeroportuarias",
      fr: "Règles aéroportuaires",
      pt: "Regras aeroportuárias",
      nl: "Luchthavenregels"
    }),
    body,
    strength: clampStrength(strength)
  };
}

function buildMedicalIntent(data: CountryPageData, locale: SeoLocale): IntentSeed {
  const label = regionLabel(data, locale);
  const medical = data.legal_model.medical.status;
  let strength = 0.2;
  let body = t(locale, {
    en: `Medical cannabis is illegal in ${label}.`,
    de: `Medizinisches Cannabis ist in ${label} illegal.`,
    es: `El cannabis medicinal es ilegal en ${label}.`,
    fr: `Le cannabis médical est illégal en ${label}.`,
    pt: `A cannabis medicinal é ilegal em ${label}.`,
    nl: `Medicinale cannabis is in ${label} illegaal.`
  });

  if (medical === "LEGAL") {
    strength = 1;
    body = t(locale, {
      en: `Medical cannabis is legal in ${label}.`,
      de: `Medizinisches Cannabis ist in ${label} legal.`,
      es: `El cannabis medicinal es legal en ${label}.`,
      fr: `Le cannabis médical est légal en ${label}.`,
      pt: `A cannabis medicinal é legal em ${label}.`,
      nl: `Medicinale cannabis is in ${label} legaal.`
    });
  } else if (medical === "LIMITED") {
    strength = 0.7;
    body = t(locale, {
      en: `Medical cannabis is limited in ${label}.`,
      de: `Medizinisches Cannabis ist in ${label} begrenzt.`,
      es: `El cannabis medicinal es limitado en ${label}.`,
      fr: `Le cannabis médical est limité en ${label}.`,
      pt: `A cannabis medicinal é limitada em ${label}.`,
      nl: `Medicinale cannabis is in ${label} beperkt.`
    });
  }

  return {
    id: "medical",
    heading: t(locale, {
      en: `Medical cannabis in ${label}`,
      de: `Medizinisches Cannabis in ${label}`,
      es: `Cannabis medicinal en ${label}`,
      fr: `Cannabis médical en ${label}`,
      pt: `Cannabis medicinal em ${label}`,
      nl: `Medicinale cannabis in ${label}`
    }),
    body,
    strength: clampStrength(strength)
  };
}

function intentRelatedHeading(id: IntentId, label: string) {
  if (id === "buy") return `Related regions for buying cannabis in ${label}`;
  if (id === "possession") return `Related regions for possession rules in ${label}`;
  if (id === "tourists") return `Related regions for tourist rules in ${label}`;
  if (id === "airport") return `Related regions for airport and border rules in ${label}`;
  return `Related regions for medical cannabis in ${label}`;
}

function rankRelatedRegions(data: CountryPageData, strength: number) {
  const seeds: Array<{ ref: CountryLinkRef; signal: RankedRelatedRegion["signal"]; weight: number }> = [
    ...data.graph.legal_similarity.map((ref) => ({ ref, signal: "legal_similarity" as const, weight: 1 })),
    ...data.graph.cluster_links.map((ref) => ({ ref, signal: "cluster" as const, weight: 0.8 })),
    ...data.graph.geo_neighbors.map((ref) => ({ ref, signal: "neighbor" as const, weight: 0.6 }))
  ];

  const seen = new Set<string>();
  return seeds
    .filter(({ ref }) => {
      if (seen.has(ref.code)) return false;
      seen.add(ref.code);
      return true;
    })
    .map(({ ref, signal, weight }) => ({
      ...ref,
      signal,
      score: Number((strength * weight).toFixed(3))
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, 3);
}

function validateIntentSeeds(data: CountryPageData, intents: IntentSeed[]) {
  const errors: string[] = [];
  for (const intent of intents) {
    if (!intent.body.trim()) errors.push(`EMPTY_INTENT:${intent.id}`);
    if (normalizeText(intent.body).includes("unknown")) errors.push(`UNKNOWN_INTENT:${intent.id}`);
  }

  const buy = intents.find((intent) => intent.id === "buy");
  const medical = intents.find((intent) => intent.id === "medical");
  const airport = intents.find((intent) => intent.id === "airport");

  if (buy) {
    const distribution = data.legal_model.distribution.status;
    if ((distribution === "illegal" || data.legal_model.distribution.scopes.sale === "illegal") && buy.strength > 0.6) {
      errors.push("INTENT_CONTRADICTION:buy");
    }
  }

  if (medical) {
    const medicalStatus = data.legal_model.medical.status;
    if (medicalStatus === "ILLEGAL" && medical.strength > 0.2) errors.push("INTENT_CONTRADICTION:medical");
    if (medicalStatus === "LEGAL" && medical.strength < 1) errors.push("INTENT_CONTRADICTION:medical");
  }

  if (airport) {
    const importIllegal = data.legal_model.distribution.scopes.import === "illegal";
    const usFederalConflict = data.parent_country?.code === "usa";
    if ((importIllegal || usFederalConflict) && airport.strength < 1) errors.push("INTENT_CONTRADICTION:airport");
  }

  return errors;
}

export function buildCountryIntentSections(data: CountryPageData, options?: { query?: string | null; locale?: SeoLocale }) {
  const locale = options?.locale || "en";
  const label = regionLabel(data, locale);
  const seeds = [
    buildBuyIntent(data, locale),
    buildPossessionIntent(data, locale),
    buildTouristsIntent(data, locale),
    buildAirportIntent(data, locale),
    buildMedicalIntent(data, locale)
  ];
  const errors = validateIntentSeeds(data, seeds);
  if (errors.length) {
    throw new Error(`COUNTRY_INTENT_INVALID:${data.code}:${errors.join(",")}`);
  }

  const queryIntent = detectIntentQuery(options?.query);
  return seeds
    .map((seed) => {
      const boostedStrength = seed.id === queryIntent ? seed.strength + 1 : seed.strength;
      return {
        id: seed.id,
        heading: seed.heading,
        body: seed.body,
        strength: boostedStrength,
        related_heading: intentRelatedHeading(seed.id, label),
        related_regions: rankRelatedRegions(data, boostedStrength)
      } satisfies CountryIntentSection;
    })
    .sort((left, right) => right.strength - left.strength || left.heading.localeCompare(right.heading));
}
