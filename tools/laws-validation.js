const { URL } = require("node:url");

const REQUIRED_FIELDS = [
  "id",
  "country",
  "medical",
  "recreational",
  "public_use",
  "cross_border",
  "risks",
  "updated_at",
  "verified_at",
  "confidence",
  "status",
  "sources"
];

const STATUS_VALUES = new Set(["known", "unknown", "needs_review"]);
const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const EXTRAS_STATUS_VALUES = new Set([
  "allowed",
  "restricted",
  "illegal",
  "unknown"
]);
const EXTRAS_KEYS = new Set([
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
]);

function assertDate(value, label, filePath) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string in ${filePath}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD in ${filePath}`);
  }
}

function validateSources(sources, filePath) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error(`Sources must be a non-empty array in ${filePath}`);
  }

  for (const source of sources) {
    if (!source || typeof source.url !== "string") {
      throw new Error(`Source url must be a string in ${filePath}`);
    }
    if (/\\s/.test(source.url)) {
      throw new Error(`Source url must not contain whitespace in ${filePath}`);
    }
    if (
      !source.url.startsWith("http://") &&
      !source.url.startsWith("https://")
    ) {
      throw new Error(
        `Source url must start with http(s) in ${filePath}`
      );
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(source.url);
    } catch {
      throw new Error(`Invalid source url "${source.url}" in ${filePath}`);
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(
        `Invalid source url protocol "${source.url}" in ${filePath}`
      );
    }
  }
}

function validateLawPayload(parsed, filePath = "payload") {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in parsed)) {
      throw new Error(`Missing field "${field}" in ${filePath}`);
    }
  }

  if (!Array.isArray(parsed.risks)) {
    throw new Error(`Risks must be an array in ${filePath}`);
  }

  const country = String(parsed.country ?? "").trim().toUpperCase();
  const region = parsed.region ? String(parsed.region).trim().toUpperCase() : "";
  if (!country) {
    throw new Error(`country must be provided in ${filePath}`);
  }
  if (parsed.region) {
    if (!region) {
      throw new Error(`region must be non-empty in ${filePath}`);
    }
    if (parsed.id !== `${country}-${region}`) {
      throw new Error(`id must be "${country}-${region}" in ${filePath}`);
    }
  } else if (parsed.id !== country) {
    throw new Error(`id must be "${country}" in ${filePath}`);
  }

  if (!STATUS_VALUES.has(parsed.status)) {
    throw new Error(`Invalid status "${parsed.status}" in ${filePath}`);
  }

  if (!CONFIDENCE_VALUES.has(parsed.confidence)) {
    throw new Error(`Invalid confidence "${parsed.confidence}" in ${filePath}`);
  }

  if (parsed.status === "known") {
    assertDate(parsed.verified_at, "verified_at", filePath);
  } else if (parsed.verified_at !== null && parsed.verified_at !== undefined) {
    assertDate(parsed.verified_at, "verified_at", filePath);
  }

  if (typeof parsed.updated_at !== "string") {
    throw new Error(`updated_at must be a string in ${filePath}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.updated_at)) {
    throw new Error(`updated_at must be YYYY-MM-DD in ${filePath}`);
  }

  validateSources(parsed.sources, filePath);

  if (parsed.extras !== undefined) {
    if (typeof parsed.extras !== "object" || parsed.extras === null) {
      throw new Error(`extras must be an object in ${filePath}`);
    }
    for (const [key, value] of Object.entries(parsed.extras)) {
      if (!EXTRAS_KEYS.has(key)) {
        throw new Error(`Invalid extras key "${key}" in ${filePath}`);
      }
      if (value === undefined || value === null) {
        throw new Error(`extras.${key} must be a string in ${filePath}`);
      }
      if (typeof value !== "string") {
        throw new Error(`extras.${key} must be a string in ${filePath}`);
      }
      if (key === "home_grow_plants") {
        if (
          !EXTRAS_STATUS_VALUES.has(value) &&
          !/^up to \\d+ plants$/i.test(value)
        ) {
          throw new Error(
            `extras.home_grow_plants must be enum or \"up to N plants\" in ${filePath}`
          );
        }
        continue;
      }
      if (!EXTRAS_STATUS_VALUES.has(value)) {
        throw new Error(`Invalid extras.${key} value in ${filePath}`);
      }
    }
  }
}

module.exports = {
  validateLawPayload
};
