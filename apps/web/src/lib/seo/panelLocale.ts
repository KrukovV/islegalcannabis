import type { CountryPageData } from "@/lib/countryPageStorage";
import type { CountryCardEntry } from "@/new-map/map.types";
import type { SeoLocale } from "@/lib/seo/i18n";
import { getLocalizedCountryName } from "@/lib/seo/i18n";

type PanelLabels = {
  eyebrowCountry: string;
  eyebrowState: string;
  titleIn: (_level: string, _name: string) => string;
  hardRestrictions: string;
  moreContext: string;
  whyThisColor: string;
  lawSnapshot: string;
  intent: string;
  related: string;
  sources: string;
  legalSource: string;
  noDedicatedSource: string;
  details: string;
};

const LABELS: Record<SeoLocale, PanelLabels> = {
  en: {
    eyebrowCountry: "Country View",
    eyebrowState: "State View",
    titleIn: (level, name) => `${level} in ${name}`,
    hardRestrictions: "Hard restrictions",
    moreContext: "More context",
    whyThisColor: "Why this color",
    lawSnapshot: "Law snapshot",
    intent: "Intent",
    related: "Related",
    sources: "Sources",
    legalSource: "Legal source →",
    noDedicatedSource: "No dedicated Cannabis_in_* source.",
    details: "Details →"
  },
  de: {
    eyebrowCountry: "Länderansicht",
    eyebrowState: "Bundesstaat-Ansicht",
    titleIn: (level, name) => `${level} in ${name}`,
    hardRestrictions: "Harte Einschränkungen",
    moreContext: "Mehr Kontext",
    whyThisColor: "Warum diese Farbe",
    lawSnapshot: "Rechtslage",
    intent: "Nutzungsfragen",
    related: "Verwandte Orte",
    sources: "Quellen",
    legalSource: "Rechtsquelle →",
    noDedicatedSource: "Keine eigene Cannabis_in_* Quelle gefunden.",
    details: "Details →"
  },
  es: {
    eyebrowCountry: "Vista del país",
    eyebrowState: "Vista del estado",
    titleIn: (level, name) => `${level} en ${name}`,
    hardRestrictions: "Restricciones fuertes",
    moreContext: "Más contexto",
    whyThisColor: "Por qué este color",
    lawSnapshot: "Resumen legal",
    intent: "Intención",
    related: "Lugares relacionados",
    sources: "Fuentes",
    legalSource: "Fuente legal →",
    noDedicatedSource: "No hay una fuente Cannabis_in_* dedicada.",
    details: "Detalles →"
  },
  fr: {
    eyebrowCountry: "Vue du pays",
    eyebrowState: "Vue de l'État",
    titleIn: (level, name) => `${level} en ${name}`,
    hardRestrictions: "Restrictions fortes",
    moreContext: "Contexte complémentaire",
    whyThisColor: "Pourquoi cette couleur",
    lawSnapshot: "Résumé juridique",
    intent: "Intentions",
    related: "Lieux liés",
    sources: "Sources",
    legalSource: "Source juridique →",
    noDedicatedSource: "Aucune source Cannabis_in_* dédiée.",
    details: "Détails →"
  },
  pt: {
    eyebrowCountry: "Visão do país",
    eyebrowState: "Visão do estado",
    titleIn: (level, name) => `${level} em ${name}`,
    hardRestrictions: "Restrições fortes",
    moreContext: "Mais contexto",
    whyThisColor: "Por que esta cor",
    lawSnapshot: "Resumo legal",
    intent: "Intenções",
    related: "Lugares relacionados",
    sources: "Fontes",
    legalSource: "Fonte legal →",
    noDedicatedSource: "Nenhuma fonte Cannabis_in_* dedicada.",
    details: "Detalhes →"
  },
  nl: {
    eyebrowCountry: "Landweergave",
    eyebrowState: "Staatweergave",
    titleIn: (level, name) => `${level} in ${name}`,
    hardRestrictions: "Harde beperkingen",
    moreContext: "Meer context",
    whyThisColor: "Waarom deze kleur",
    lawSnapshot: "Juridische samenvatting",
    intent: "Intentie",
    related: "Gerelateerde plaatsen",
    sources: "Bronnen",
    legalSource: "Juridische bron →",
    noDedicatedSource: "Geen aparte Cannabis_in_* bron gevonden.",
    details: "Details →"
  }
};

function localeLabels(locale: SeoLocale) {
  return LABELS[locale] || LABELS.en;
}

function translateLevelTitle(entry: CountryCardEntry, locale: SeoLocale) {
  if (locale === "en") return entry.panel.levelTitle;
  if (entry.mapCategory === "ILLEGAL") {
    return locale === "de" ? "Illegal" : locale === "es" ? "Ilegal" : locale === "fr" ? "Illégal" : locale === "pt" ? "Ilegal" : "Illegaal";
  }
  if (entry.mapCategory === "LIMITED_OR_MEDICAL") {
    return locale === "de" ? "Eingeschränkt" : locale === "es" ? "Restringido" : locale === "fr" ? "Restreint" : locale === "pt" ? "Restrito" : "Beperkt";
  }
  return locale === "de"
    ? "Legal oder teilweise erlaubt"
    : locale === "es"
      ? "Legal o parcialmente permitido"
      : locale === "fr"
        ? "Légal ou partiellement autorisé"
        : locale === "pt"
          ? "Legal ou parcialmente permitido"
          : "Legaal of deels toegestaan";
}

function translateSummary(entry: CountryCardEntry, locale: SeoLocale) {
  if (locale === "en") return entry.panel.summary;
  if (entry.mapCategory === "ILLEGAL") {
    return locale === "de"
      ? "Nach aktueller Rechtslage illegal."
      : locale === "es"
        ? "Ilegal según la ley vigente."
        : locale === "fr"
          ? "Illégal selon la loi actuelle."
          : locale === "pt"
            ? "Ilegal pela lei atual."
            : "Illegaal volgens de huidige wet.";
  }
  if (entry.mapCategory === "LIMITED_OR_MEDICAL") {
    return locale === "de"
      ? "Eingeschränkt, aber ein begrenzter legaler Zugang besteht."
      : locale === "es"
        ? "Restringido, pero existe un acceso legal limitado."
        : locale === "fr"
          ? "Restreint, mais un accès légal limité existe."
          : locale === "pt"
            ? "Restrito, mas existe algum acesso legal limitado."
            : "Beperkt, maar er bestaat beperkte legale toegang.";
  }
  return entry.result.status === "LEGAL"
    ? locale === "de"
      ? "Legaler Zugang ist bestätigt."
      : locale === "es"
        ? "El acceso legal está confirmado."
        : locale === "fr"
          ? "L'accès légal est confirmé."
          : locale === "pt"
            ? "O acesso legal está confirmado."
            : "Legale toegang is bevestigd."
    : locale === "de"
      ? "Entkriminalisiert oder in der Praxis teilweise erlaubt."
      : locale === "es"
        ? "Despenalizado o parcialmente permitido en la práctica."
        : locale === "fr"
          ? "Décriminalisé ou partiellement autorisé dans la pratique."
          : locale === "pt"
            ? "Descriminalizado ou parcialmente permitido na prática."
            : "Gedecriminaliseerd of in de praktijk deels toegestaan.";
}

function translateWhy(data: CountryPageData | null | undefined, entry: CountryCardEntry, locale: SeoLocale) {
  if (locale === "en") {
    return entry.mapReason ||
      (entry.mapCategory === "ILLEGAL"
        ? "Red because hard restrictions remain and no lawful access is confirmed."
        : entry.mapCategory === "LIMITED_OR_MEDICAL"
          ? "Yellow because restrictions remain, but there is limited lawful access."
          : "Green because current access is legal, decriminalized, or tolerated.");
  }

  if (entry.mapCategory === "ILLEGAL") {
    return locale === "de"
      ? "Rot, weil harte Beschränkungen bestehen bleiben und kein legaler Zugang bestätigt ist."
      : locale === "es"
        ? "Rojo porque siguen existiendo restricciones fuertes y no hay acceso legal confirmado."
        : locale === "fr"
          ? "Rouge car des restrictions fortes demeurent et aucun accès légal n'est confirmé."
          : locale === "pt"
            ? "Vermelho porque restrições fortes permanecem e não há acesso legal confirmado."
            : "Rood omdat harde beperkingen blijven gelden en er geen legale toegang is bevestigd.";
  }

  if (entry.mapCategory === "LIMITED_OR_MEDICAL") {
    if (entry.normalizedMedicalStatus === "LEGAL" || entry.normalizedMedicalStatus === "LIMITED") {
      return locale === "de"
        ? "Gelb, weil Freizeitkonsum illegal bleibt, aber medizinischer Zugang existiert."
        : locale === "es"
          ? "Amarillo porque el uso recreativo sigue siendo ilegal, pero existe acceso médico."
          : locale === "fr"
            ? "Jaune car l'usage récréatif reste illégal, mais un accès médical existe."
            : locale === "pt"
              ? "Amarelo porque o uso recreativo continua ilegal, mas existe acesso médico."
              : "Geel omdat recreatief gebruik illegaal blijft, maar medische toegang bestaat.";
    }
    return locale === "de"
      ? "Gelb, weil Beschränkungen bleiben, der Zugang in der Praxis aber teilweise aufgeweicht ist."
      : locale === "es"
        ? "Amarillo porque siguen existiendo restricciones, pero la práctica suaviza parte del acceso."
        : locale === "fr"
          ? "Jaune car les restrictions demeurent, mais la pratique assouplit une partie de l'accès."
          : locale === "pt"
            ? "Amarelo porque as restrições permanecem, mas a prática suaviza parte do acesso."
            : "Geel omdat beperkingen blijven bestaan, maar de praktijk een deel van de toegang verzacht.";
  }

  if (entry.normalizedRecreationalStatus === "DECRIMINALIZED") {
    return locale === "de"
      ? "Grün, weil der Besitz kleiner Mengen entkriminalisiert ist und die aktuelle Praxis dadurch weicher ausfällt."
      : locale === "es"
        ? "Verde porque la posesión de pequeñas cantidades está despenalizada y la práctica actual es más flexible."
        : locale === "fr"
          ? "Vert parce que la possession de petites quantités est dépénalisée et que la pratique actuelle est plus souple."
          : locale === "pt"
            ? "Verde porque a posse de pequenas quantidades foi descriminalizada e a prática atual é mais branda."
            : "Groen omdat bezit van kleine hoeveelheden is gedecriminaliseerd en de praktijk daardoor soepeler is.";
  }

  return locale === "de"
    ? "Grün, weil der aktuelle Zugang legal, entkriminalisiert oder praktisch geduldet ist."
    : locale === "es"
      ? "Verde porque el acceso actual es legal, despenalizado o tolerado en la práctica."
      : locale === "fr"
        ? "Vert parce que l'accès actuel est légal, dépénalisé ou toléré dans la pratique."
        : locale === "pt"
          ? "Verde porque o acesso atual é legal, descriminalizado ou tolerado na prática."
          : "Groen omdat de huidige toegang legaal, gedecriminaliseerd of in de praktijk gedoogd is.";
}

function translateReasonText(reasonId: string, data: CountryPageData | null | undefined, entry: CountryCardEntry, locale: SeoLocale) {
  if (locale === "en") return null;
  switch (reasonId) {
    case "rec-illegal":
      return locale === "de" ? "Freizeitkonsum bleibt illegal." : locale === "es" ? "El uso recreativo sigue prohibido." : locale === "fr" ? "L'usage récréatif reste interdit." : locale === "pt" ? "O uso recreativo continua proibido." : "Recreatief gebruik blijft verboden.";
    case "rec-decrim":
      return locale === "de" ? "Der Besitz kleiner Mengen für den Eigenbedarf ist entkriminalisiert." : locale === "es" ? "La posesión de pequeñas cantidades para uso personal está despenalizada." : locale === "fr" ? "La possession de petites quantités pour usage personnel est dépénalisée." : locale === "pt" ? "A posse de pequenas quantidades para uso pessoal foi descriminalizada." : "Bezits van kleine hoeveelheden voor eigen gebruik is gedecriminaliseerd.";
    case "rec-tolerated":
      return locale === "de" ? "Der Eigengebrauch wird in der Praxis teilweise geduldet." : locale === "es" ? "El uso personal se tolera en parte en la práctica." : locale === "fr" ? "L'usage personnel est en partie toléré dans la pratique." : locale === "pt" ? "O uso pessoal é em parte tolerado na prática." : "Persoonlijk gebruik wordt in de praktijk deels gedoogd.";
    case "rec-legal":
      return locale === "de" ? "Freizeitlicher Zugang ist legal." : locale === "es" ? "El acceso recreativo es legal." : locale === "fr" ? "L'accès récréatif est légal." : locale === "pt" ? "O acesso recreativo é legal." : "Recreatieve toegang is legaal.";
    case "distribution-illegal":
      return locale === "de" ? "Verkauf und Vertrieb bleiben verboten." : locale === "es" ? "La venta y la distribución siguen prohibidas." : locale === "fr" ? "La vente et la distribution restent interdites." : locale === "pt" ? "A venda e a distribuição continuam proibidas." : "Verkoop en distributie blijven verboden.";
    case "distribution-mixed":
      return locale === "de" ? "Der Zugang hängt von lokalen Kanälen und Bedingungen ab." : locale === "es" ? "El acceso depende de canales locales y condiciones concretas." : locale === "fr" ? "L'accès dépend de circuits locaux et de conditions précises." : locale === "pt" ? "O acesso depende de canais locais e de condições específicas." : "Toegang hangt af van lokale kanalen en voorwaarden.";
    case "penalty-prison":
      return locale === "de" ? "Strafrechtliche Folgen können Haft einschließen." : locale === "es" ? "Las sanciones penales pueden incluir prisión." : locale === "fr" ? "Les sanctions pénales peuvent inclure la prison." : locale === "pt" ? "As penalidades criminais podem incluir prisão." : "Strafrechtelijke gevolgen kunnen gevangenisstraf omvatten.";
    case "penalty-arrest":
      return locale === "de" ? "Ein Polizeigewahrsam ist Teil des Risikos." : locale === "es" ? "El riesgo de detención policial está presente." : locale === "fr" ? "Le risque de garde à vue existe." : locale === "pt" ? "Existe risco de detenção policial." : "Er is risico op politiedetentie.";
    case "penalty-fine":
      return locale === "de" ? "Bei kleinen Mengen bleiben Geldbußen typisch." : locale === "es" ? "Las pequeñas cantidades suelen implicar multas." : locale === "fr" ? "Les petites quantités entraînent souvent des amendes." : locale === "pt" ? "Pequenas quantidades costumam resultar em multa." : "Kleine hoeveelheden leiden meestal tot een boete.";
    case "medical-access":
      if (entry.normalizedMedicalStatus === "LEGAL") {
        return locale === "de" ? "Medizinischer Zugang ist legal." : locale === "es" ? "El acceso médico es legal." : locale === "fr" ? "L'accès médical est légal." : locale === "pt" ? "O acesso medicinal é legal." : "Medische toegang is legaal.";
      }
      return locale === "de" ? "Medizinischer Zugang ist begrenzt." : locale === "es" ? "El acceso médico es limitado." : locale === "fr" ? "L'accès médical est limité." : locale === "pt" ? "O acesso medicinal é limitado." : "Medische toegang is beperkt.";
    case "weak-enforcement":
      return locale === "de" ? "Die Durchsetzung ist in der Praxis oft schwach." : locale === "es" ? "La aplicación suele ser débil en la práctica." : locale === "fr" ? "L'application est souvent faible dans la pratique." : locale === "pt" ? "A aplicação costuma ser fraca na prática." : "Handhaving is in de praktijk vaak zwak.";
    case "why-red":
    case "why-yellow":
    case "why-green":
      return translateWhy(data, entry, locale);
    default:
      return null;
  }
}

export function localizePanel(entry: CountryCardEntry, data: CountryPageData, locale: SeoLocale) {
  const labels = localeLabels(locale);
  const levelTitle = translateLevelTitle(entry, locale);
  const summary = translateSummary(entry, locale);
  const localizedName = data.node_type === "country" ? getLocalizedCountryName(data, locale) : (data.name.split(" / ")[0] || data.name);
  const translateReasons = (items: CountryCardEntry["panel"]["critical"]) =>
    items.map((item) => ({
      ...item,
      text: translateReasonText(item.id, data, entry, locale) || item.text
    }));

  return {
    labels,
    levelTitle,
    title: labels.titleIn(levelTitle, localizedName),
    summary,
    critical: translateReasons(entry.panel.critical),
    info: translateReasons(entry.panel.info),
    why: entry.panel.why.map((item) => ({
      ...item,
      text: translateReasonText(item.id, data, entry, locale) || translateWhy(data, entry, locale)
    }))
  };
}

export function localizePanelFromEntry(entry: CountryCardEntry, locale: SeoLocale) {
  const labels = localeLabels(locale);
  const levelTitle = translateLevelTitle(entry, locale);
  const summary = translateSummary(entry, locale);
  const translateReasons = (items: CountryCardEntry["panel"]["critical"]) =>
    items.map((item) => ({
      ...item,
      text: translateReasonText(item.id, null, entry, locale) || item.text
    }));

  return {
    labels,
    levelTitle,
    summary,
    critical: translateReasons(entry.panel.critical),
    info: translateReasons(entry.panel.info),
    why: entry.panel.why.map((item) => ({
      ...item,
      text: translateReasonText(item.id, null, entry, locale) || translateWhy(null, entry, locale)
    }))
  };
}
