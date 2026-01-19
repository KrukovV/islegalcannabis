function toArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function uniq(values) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeCatalogEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return {
      candidates: [],
      verified: { medical: [], recreational: [] },
      auto: { medical: [], recreational: [], official: [] },
      notes: ""
    };
  }
  const candidates = uniq(toArray(entry.candidates));
  let verified = entry.verified && typeof entry.verified === "object"
    ? entry.verified
    : null;
  if (!verified) {
    verified = {
      medical: toArray(entry.medical),
      recreational: toArray(entry.recreational)
    };
  } else {
    verified = {
      medical: toArray(verified.medical),
      recreational: toArray(verified.recreational)
    };
  }
  const auto = entry.auto && typeof entry.auto === "object"
    ? entry.auto
    : {};
  return {
    candidates,
    verified,
    auto: {
      medical: toArray(auto.medical),
      recreational: toArray(auto.recreational),
      official: toArray(auto.official)
    },
    notes: typeof entry.notes === "string" ? entry.notes : ""
  };
}

export function collectVerifiedUrls(entry) {
  const normalized = normalizeCatalogEntry(entry);
  const urls = [];
  for (const [kind, list] of Object.entries(normalized.verified)) {
    for (const url of list) {
      urls.push({ kind, url });
    }
  }
  return urls;
}

export function collectOfficialUrls(entry) {
  const normalized = normalizeCatalogEntry(entry);
  const urls = [
    ...normalized.verified.medical,
    ...normalized.verified.recreational,
    ...normalized.auto.medical,
    ...normalized.auto.recreational,
    ...normalized.auto.official
  ];
  return uniq(urls);
}
