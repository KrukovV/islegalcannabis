function buildWikiUrl(title) {
  if (!title) return "";
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function stripWikiMarkup(value) {
  let text = String(value || "");
  text = text.replace(/<ref[\s\S]*?<\/ref>/gi, " ");
  text = text.replace(/<ref[^>]*\/?>/gi, " ");
  text = text.replace(/\{\{[^}]+\}\}/g, " ");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function extractFlagTemplate(value) {
  const raw = String(value || "");
  const match = raw.match(/\{\{\s*flag(?:icon|deco|country|icon image)?\s*\|\s*([^|}]+)\s*/i);
  if (match && match[1]) return match[1].trim();
  return "";
}

function extractCountryName(cellText) {
  const templateValue = extractFlagTemplate(cellText);
  if (templateValue) return stripWikiMarkup(templateValue);
  const stripped = stripWikiMarkup(cellText);
  if (!stripped || /^id=/i.test(stripped)) return "";
  return stripped;
}

function extractWikiLinks(value) {
  const links = [];
  const text = String(value || "");
  const matches = text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g);
  for (const match of matches) {
    const title = String(match[1] || "").trim();
    if (!title) continue;
    links.push(title);
  }
  return links;
}

function extractMainArticles(value) {
  const text = String(value || "");
  const results = [];
  const mainTemplate = text.matchAll(/\{\{\s*main\s*\|([^}]+)\}\}/gi);
  for (const match of mainTemplate) {
    const chunk = match[1] || "";
    const parts = chunk.split("|").map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const cleaned = part.replace(/\[\[|\]\]/g, "");
      if (cleaned) results.push(cleaned);
    }
  }
  if (/Main article/i.test(text) || /Main articles/i.test(text)) {
    const links = extractWikiLinks(text);
    for (const link of links) results.push(link);
  }
  const unique = Array.from(new Set(results));
  return unique.map((title) => ({ title, url: buildWikiUrl(title) }));
}

export function parseRecreationalStatus(value) {
  const raw = String(value || "").toLowerCase();
  if (/\{\{\s*hs\|0\.[1-9]/.test(raw)) return "Legal";
  if (/\{\{\s*hs\|0(?:\.0+)?\b/.test(raw)) return "Illegal";
  if (/\{\{\s*hs\|[1-9]/.test(raw)) return "Legal";
  if (/\{\{\s*(illegal|prohibited|no)\b/.test(raw)) return "Illegal";
  if (/\{\{\s*(decriminal|decrim|partial)\b/.test(raw)) return "Decrim";
  if (/\{\{\s*(legal|yes)\b/.test(raw)) return "Legal";
  const text = stripWikiMarkup(value).toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("unenforced") || text.includes("non-enforced")) return "Unenforced";
  if (text.includes("decriminal")) return "Decrim";
  if (text.includes("legal")) return "Legal";
  if (text.includes("illegal") || text.includes("prohibited")) return "Illegal";
  return "Unknown";
}

export function parseMedicalStatus(value) {
  const raw = String(value || "").toLowerCase();
  if (/\{\{\s*hs\|0\.[1-9]/.test(raw)) return "Legal";
  if (/\{\{\s*hs\|0(?:\.0+)?\b/.test(raw)) return "Illegal";
  if (/\{\{\s*hs\|[1-9]/.test(raw)) return "Legal";
  if (/\{\{\s*(illegal|prohibited|no)\b/.test(raw)) return "Illegal";
  if (/\{\{\s*(limited|restricted|partial)\b/.test(raw)) return "Limited";
  if (/\{\{\s*(medical|yes|legal)\b/.test(raw)) return "Legal";
  const text = stripWikiMarkup(value).toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("legal") || text.includes("medical")) return "Legal";
  if (text.includes("limited") || text.includes("restricted") || text.includes("low thc")) {
    return "Limited";
  }
  if (text.includes("illegal") || text.includes("prohibited")) return "Illegal";
  return "Unknown";
}

function splitRowCells(rowText) {
  const cells = [];
  let current = "";
  let depthSquare = 0;
  let depthCurly = 0;
  const flush = () => {
    const trimmed = current.replace(/^\s*[!|]/, "").trim();
    if (trimmed) cells.push(trimmed);
    current = "";
  };
  for (let i = 0; i < rowText.length; i += 1) {
    const chunk = rowText.slice(i, i + 2);
    if (chunk === "[[") {
      depthSquare += 1;
      current += chunk;
      i += 1;
      continue;
    }
    if (chunk === "]]" && depthSquare > 0) {
      depthSquare -= 1;
      current += chunk;
      i += 1;
      continue;
    }
    if (chunk === "{{") {
      depthCurly += 1;
      current += chunk;
      i += 1;
      continue;
    }
    if (chunk === "}}" && depthCurly > 0) {
      depthCurly -= 1;
      current += chunk;
      i += 1;
      continue;
    }
    if (depthSquare === 0 && depthCurly === 0) {
      if (chunk === "||" || chunk === "!!") {
        flush();
        i += 1;
        continue;
      }
      if (rowText[i] === "\n" && (rowText[i + 1] === "|" || rowText[i + 1] === "!")) {
        flush();
        current += rowText[i + 1];
        i += 1;
        continue;
      }
    }
    current += rowText[i];
  }
  flush();
  return cells;
}

function extractTableFromWikitext(wikitext) {
  const tables = [];
  const parts = String(wikitext || "").split("{|");
  for (let i = 1; i < parts.length; i += 1) {
    const chunk = parts[i];
    const end = chunk.indexOf("|}");
    if (end === -1) continue;
    const table = "{|" + chunk.slice(0, end + 2);
    tables.push(table);
  }
  return (
    tables.find((table) => /Country\/Territory|Country or territory/i.test(table)) ||
    tables.find((table) => /State|Province|Territory/i.test(table)) ||
    ""
  );
}

function parseWikiTable(tableText) {
  if (!tableText) return [];
  const rows = tableText.split(/\n\|-+/g).slice(1);
  const parsed = [];
  for (const row of rows) {
    if (!row.trim()) continue;
    const cells = splitRowCells(row);
    if (cells.length < 3) continue;
    let countryCell = cells[0] || "";
    let recCell = cells[1] || "";
    let medCell = cells[2] || "";
    let notesCell = cells[3] || "";
    if (/^id=/i.test(stripWikiMarkup(countryCell)) && cells.length >= 4) {
      countryCell = cells[1] || "";
      recCell = cells[2] || "";
      medCell = cells[3] || "";
      notesCell = cells[4] || "";
    }
    const fallbackName = extractFlagTemplate(countryCell);
    const link = extractWikiLinks(countryCell)[0] || fallbackName || "";
    const name = extractCountryName(countryCell);
    if (!name) continue;
    if (/^Country\/Territory$/i.test(name) || /^Country or territory$/i.test(name) || /^State$/i.test(name)) {
      continue;
    }
    parsed.push({
      name,
      link,
      recreational: recCell,
      medical: medCell,
      notes: notesCell
    });
  }
  return parsed;
}

export function parseLegalityTable(wikitext) {
  const table = extractTableFromWikitext(wikitext);
  const rows = parseWikiTable(table);
  const parsed = rows.map((row) => {
    const notesRaw = String(row.notes || "");
    const notesText = stripWikiMarkup(notesRaw);
    const mainArticles = extractMainArticles(notesRaw);
    return {
      name: row.name,
      link: row.link,
      wiki_row_url: buildWikiUrl(row.link || row.name || ""),
      recreational_status: parseRecreationalStatus(row.recreational),
      medical_status: parseMedicalStatus(row.medical),
      recreational_raw: row.recreational,
      medical_raw: row.medical,
      notes_raw: notesRaw,
      notes_text: notesText,
      notes_main_articles: mainArticles
    };
  });
  const totalArticles = parsed.reduce((total, row) => total + row.notes_main_articles.length, 0);
  console.log(`WIKI_PARSE: rows=${parsed.length} main_articles_total=${totalArticles}`);
  return parsed;
}

export function normalizeRowStatuses(row) {
  if (!row || typeof row !== "object") return row;
  const recreationalRaw =
    row.recreational_raw ?? row.recreational ?? row.recreational_status ?? "";
  const medicalRaw =
    row.medical_raw ?? row.medical ?? row.medical_status ?? "";
  return {
    ...row,
    recreational_status: parseRecreationalStatus(recreationalRaw),
    medical_status: parseMedicalStatus(medicalRaw),
    recreational_raw: recreationalRaw,
    medical_raw: medicalRaw
  };
}
