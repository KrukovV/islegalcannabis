export type DisputedGeoSourceMapping = {
  displayName?: string;
  territoryWikiUrl: string;
  claimantGeoCodes: string[];
  jurisdictionNote: string;
};

export const DISPUTED_GEO_SOURCE_MAPPINGS: Record<string, DisputedGeoSourceMapping> = {
  BJN: {
    territoryWikiUrl: "https://en.wikipedia.org/wiki/Bajo_Nuevo_Bank",
    claimantGeoCodes: ["COL", "USA", "JAM", "NIC"],
    jurisdictionNote:
      "Bajo Nuevo Bank is disputed; Colombia administers it, while the United States, Jamaica, and Nicaragua also maintain claims."
  },
  BRT: {
    territoryWikiUrl: "https://en.wikipedia.org/wiki/Bir_Tawil",
    claimantGeoCodes: ["EGY", "SDN"],
    jurisdictionNote:
      "Bir Tawil is unclaimed land between Egypt and Sudan; the sources below reflect the adjacent claimant states rather than a settled sovereign legal regime."
  },
  KAS: {
    territoryWikiUrl: "https://en.wikipedia.org/wiki/Siachen_Glacier",
    claimantGeoCodes: ["IND", "PAK"],
    jurisdictionNote:
      "Siachen Glacier is controlled by India and claimed by Pakistan; the sources below reflect both claimant jurisdictions."
  },
  PGA: {
    displayName: "Spratly Islands",
    territoryWikiUrl: "https://en.wikipedia.org/wiki/Spratly_Islands",
    claimantGeoCodes: ["CHN", "TWN", "VNM", "PHL", "MYS", "BRN"],
    jurisdictionNote:
      "Spratly Islands are disputed among China, Taiwan, Vietnam, the Philippines, Malaysia, and Brunei; the sources below reflect the principal claimant jurisdictions."
  },
  SCR: {
    displayName: "Scarborough Shoal",
    territoryWikiUrl: "https://en.wikipedia.org/wiki/Scarborough_Shoal",
    claimantGeoCodes: ["CHN", "TWN", "PHL"],
    jurisdictionNote:
      "Scarborough Shoal has been under de facto Chinese control since 2012 and is also claimed by Taiwan and the Philippines."
  },
  SER: {
    territoryWikiUrl: "https://en.wikipedia.org/wiki/Serranilla_Bank",
    claimantGeoCodes: ["COL", "USA", "HND", "NIC"],
    jurisdictionNote:
      "Serranilla Bank is administered by Colombia, while the United States, Honduras, and Nicaragua also maintain claims."
  },
  SPI: {
    territoryWikiUrl: "https://en.wikipedia.org/wiki/Southern_Patagonian_Ice_Field",
    claimantGeoCodes: ["ARG", "CHL"],
    jurisdictionNote:
      "Southern Patagonian Ice Field remains under pending boundary demarcation between Argentina and Chile."
  }
};

