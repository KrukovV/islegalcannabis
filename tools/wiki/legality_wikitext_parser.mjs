function buildWikiUrl(title) {
  if (!title) return "";
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function normalizeNotesText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWikiMarkup(value) {
  let text = String(value || "");
  text = text.replace(
    /\{\{\s*(plainlist|flatlist|ubl|unbulleted list|bulleted list|unordered list|list)\s*\|([\s\S]*?)\}\}/gi,
    (_, __, body) => body.split("|").map((part) => part.replace(/^\s*\*\s*/g, "").trim()).filter(Boolean).join(" ")
  );
  text = text.replace(/\{\{\s*nowrap\s*\|([\s\S]*?)\}\}/gi, "$1");
  text = text.replace(/\{\{\s*lang\s*\|[^|}]+\|([\s\S]*?)\}\}/gi, "$1");
  text = text.replace(/\{\{\s*small\s*\|([\s\S]*?)\}\}/gi, "$1");
  text = text.replace(/\{\{\s*abbr\s*\|([^|}]+)(?:\|[^}]+)?\}\}/gi, "$1");
  text = text.replace(/\{\{\s*cvt\|([^}|]+)\|([^}|]+)[^}]*\}\}/gi, "$1 $2");
  text = text.replace(/\{\{\s*convert\|([^}|]+)\|([^}|]+)[^}]*\}\}/gi, "$1 $2");
  text = text.replace(/<ref[\s\S]*?<\/ref>/gi, " ");
  text = text.replace(/<ref[^>]*\/?>/gi, " ");
  text = text.replace(/\{\{[\s\S]*?\}\}/g, " ");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;|&#160;/gi, " ");
  return normalizeNotesText(text);
}

function notesTextFromRaw(value) {
  let text = String(value || "");
  if (isMainOnlyRaw(text)) {
    const articles = extractMainArticles(text);
    const titles = articles.map((article) => article.title).filter(Boolean);
    return normalizeNotesText(
      titles.length ? `Main article: ${titles.join("; ")}` : "Main article"
    );
  }
  text = text.replace(/\{\{\s*main\s*\|[^}]+\}\}/gi, " ");
  text = text.replace(/\{\{\s*see\s*also\s*\|[^}]+\}\}/gi, " ");
  text = text.replace(/\{\{\s*further(?:\s+information)?\s*\|[^}]+\}\}/gi, " ");
  return stripWikiMarkup(text);
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

function isMainOnlyRaw(raw) {
  const rawText = String(raw || "").replace(/\s+/g, " ").trim();
  return /^\{\{\s*main\s*\|[^}]+\}\}$/i.test(rawText);
}

function isPlaceholderNote(text) {
  const normalized = normalizeNotesText(text);
  if (!normalized) return false;
  if (/^Cannabis in\s+/i.test(normalized)) return true;
  if (/^Main articles?:/i.test(normalized)) return true;
  if (/^Main article:/i.test(normalized)) return true;
  if (/^See also:/i.test(normalized)) return true;
  if (/^Further information:/i.test(normalized)) return true;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= 2 && normalized.length <= 20) return true;
  return false;
}

const SECTION_PRIORITY = [
  "notes",
  "footnotes",
  "additional information",
  "legality",
  "legal status",
  "status",
  "penalties",
  "penalty",
  "possession",
  "decriminalization",
  "medical",
  "recreational",
  "cultivation",
  "use",
  "enforcement"
];

function extractNotesFromWikitextSections(wikitext, priority = SECTION_PRIORITY) {
  const lines = String(wikitext || "").split(/\r?\n/);
  let currentTitle = "";
  let currentLines = [];
  const sections = [];
  for (const line of lines) {
    const heading = line.match(/^==+\s*(.*?)\s*==+\s*$/);
    if (heading) {
      if (currentTitle) {
        sections.push({ title: currentTitle, body: currentLines.join("\n") });
      }
      currentTitle = heading[1] || "";
      currentLines = [];
      continue;
    }
    if (currentTitle) currentLines.push(line);
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, body: currentLines.join("\n") });
  }
  const normalizedPriority = Array.isArray(priority) ? priority : SECTION_PRIORITY;
  for (const key of normalizedPriority) {
    const target = sections.find((section) =>
      normalizeNotesText(section.title).toLowerCase().includes(key)
    );
    if (!target) continue;
    const body = target.body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) =>
        line &&
        !line.startsWith("{{") &&
        !line.startsWith("|") &&
        !line.startsWith("{|") &&
        !line.startsWith("|}") &&
        !line.startsWith("!")
      );
    const cleaned = normalizeNotesText(stripWikiMarkup(body.join(" ")));
    if (cleaned && !isPlaceholderNote(cleaned)) return cleaned;
  }
  return "";
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
  if (text.includes("illegal") || text.includes("prohibited")) return "Illegal";
  if (text.includes("legal")) return "Legal";
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
  if (text.includes("illegal") || text.includes("prohibited")) return "Illegal";
  if (text.includes("prescribed") || text.includes("0.2%") || text.includes("low thc")) {
    return "Limited";
  }
  if (text.includes("legal") || text.includes("medical")) return "Legal";
  if (text.includes("limited") || text.includes("restricted") || text.includes("low thc")) {
    return "Limited";
  }
  return "Unknown";
}

function splitRowCells(rowText) {
  const cells = [];
  let current = "";
  let depthSquare = 0;
  let depthCurly = 0;
  const flush = () => {
    const trimmed = current.replace(/^\s*[!|]/, "").trim();
    if (!trimmed || /^<!--/i.test(trimmed)) {
      current = "";
      return;
    }
    cells.push(trimmed);
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

function normalizeWikiKey(value) {
  const text = normalizeNotesText(stripWikiMarkup(value));
  return text.toLowerCase();
}

function extractHeaderCells(tableText) {
  const headerBlock = tableText.split(/\n\|-+/g)[0] || "";
  const lines = headerBlock.split("\n").filter((line) => line.trim().startsWith("!"));
  if (!lines.length) return [];
  const joined = lines.join("\n");
  return splitRowCells(joined);
}

function resolveColumnIndexes(tableText) {
  const headerCells = extractHeaderCells(tableText);
  let nameIndex = 0;
  let recIndex = 1;
  let medIndex = 2;
  let notesIndex = 3;
  headerCells.forEach((cell, idx) => {
    const text = stripWikiMarkup(cell).toLowerCase();
    if (text.includes("country") || text.includes("territory") || text.includes("state")) {
      nameIndex = idx;
    }
    if (text.includes("recreational")) {
      recIndex = idx;
    }
    if (text.includes("medical")) {
      medIndex = idx;
    }
    if (text.includes("notes")) {
      notesIndex = idx;
    }
  });
  return { nameIndex, recIndex, medIndex, notesIndex, totalCols: headerCells.length };
}

function applyRowspanRow(cells, carryByIndex, totalCols) {
  const rowCells = Array.from({ length: totalCols }, () => "");
  for (let idx = 0; idx < totalCols; idx += 1) {
    const carry = carryByIndex[idx];
    if (carry && carry.remaining > 0) {
      rowCells[idx] = carry.cell;
      carry.remaining -= 1;
    }
  }
  let colIndex = 0;
  for (const cell of cells) {
    while (colIndex < totalCols && rowCells[colIndex]) colIndex += 1;
    if (colIndex >= totalCols) break;
    rowCells[colIndex] = cell;
    const rowspan = cell.match(/rowspan\s*=\s*"?(\d+)/i);
    if (rowspan) {
      carryByIndex[colIndex] = {
        cell,
        remaining: Math.max(0, Number(rowspan[1] || 0) - 1)
      };
    }
    colIndex += 1;
  }
  return rowCells;
}

export function extractNotesFromWikitextTable(wikitext) {
  const result = new Map();
  const table = extractTableFromWikitext(wikitext);
  if (!table) return result;
  const indexes = resolveColumnIndexes(table);
  const totalCols = Math.max(
    indexes.totalCols || 0,
    indexes.nameIndex,
    indexes.recIndex,
    indexes.medIndex,
    indexes.notesIndex
  ) + 1;
  const rows = table.split(/\n\|-+/g).slice(1);
  const carryByIndex = Array.from({ length: totalCols }, () => null);
  for (const row of rows) {
    if (!row.trim()) continue;
    const cells = splitRowCells(row);
    if (cells.length < 3) continue;
    const rowCells = applyRowspanRow(cells, carryByIndex, totalCols);
    let offset = 0;
    const firstCellRaw = rowCells[0] || "";
    const firstCellStrip = stripWikiMarkup(firstCellRaw);
    const firstCellHasFlag = /\{\{\s*flag/i.test(firstCellRaw) || /\[\[/.test(firstCellRaw);
    if (/^id=/i.test(firstCellStrip) && !firstCellHasFlag) {
      offset = 1;
    }
    const nameCell = rowCells[indexes.nameIndex + offset] || "";
    const notesCell = rowCells[indexes.notesIndex + offset] || "";
    const name = extractCountryName(nameCell);
    if (!name) continue;
    const notesText = stripWikiMarkup(notesCell);
    if (notesText) {
      result.set(normalizeWikiKey(name), notesText);
    }
  }
  return result;
}

function parseWikiTable(tableText) {
  if (!tableText) return [];
  const indexes = resolveColumnIndexes(tableText);
  const totalCols = Math.max(
    indexes.totalCols || 0,
    indexes.nameIndex,
    indexes.recIndex,
    indexes.medIndex,
    indexes.notesIndex
  ) + 1;
  const rows = tableText.split(/\n\|-+/g).slice(1);
  const parsed = [];
  const carryByIndex = Array.from({ length: totalCols }, () => null);
  for (const row of rows) {
    if (!row.trim()) continue;
    const cells = splitRowCells(row);
    if (cells.length < 3) continue;
    const rowCells = applyRowspanRow(cells, carryByIndex, totalCols);
    let offset = 0;
    const firstCellRaw = rowCells[0] || "";
    const firstCellStrip = stripWikiMarkup(firstCellRaw);
    const firstCellHasFlag = /\{\{\s*flag/i.test(firstCellRaw) || /\[\[/.test(firstCellRaw);
    if (/^id=/i.test(firstCellStrip) && !firstCellHasFlag) {
      offset = 1;
    }
    const countryCell = rowCells[indexes.nameIndex + offset] || "";
    const recCell = rowCells[indexes.recIndex + offset] || "";
    const medCell = rowCells[indexes.medIndex + offset] || "";
    let notesCell = rowCells[indexes.notesIndex + offset] || "";
    const fallbackName = extractFlagTemplate(countryCell);
    const link = extractWikiLinks(countryCell)[0] || fallbackName || "";
    let name = extractCountryName(countryCell);
    if ((!name || /^[A-Z]{2}$/i.test(name)) && link) {
      name = link;
    }
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

export function parseLegalityTable(wikitext, notesMap = null) {
  const table = extractTableFromWikitext(wikitext);
  const rows = parseWikiTable(table);
  const parsed = rows.map((row) => {
    const notesRaw = String(row.notes || "");
    const extractedNotes = notesTextFromRaw(notesRaw);
    let notesText = extractedNotes;
    const mainArticles = extractMainArticles(notesRaw);
    const mainOnly = isMainOnlyRaw(notesRaw);
    const hasMainTemplate = /\{\{\s*main\s*\|/i.test(notesRaw) || /Main articles?/i.test(notesRaw);
    if (mainOnly) {
      const titles = mainArticles.map((article) => article.title).filter(Boolean);
      notesText = titles.length ? `Main article: ${titles.join("; ")}` : "Main article";
    }
    if (!notesText && mainArticles.length > 0 && !mainOnly && !hasMainTemplate) {
      const titles = mainArticles.map((article) => article.title).filter(Boolean);
      if (titles.length) {
        notesText = titles.join("; ");
      }
    }
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
  const merged = applyNotesMap(parsed, notesMap);
  const totalArticles = merged.reduce((total, row) => total + row.notes_main_articles.length, 0);
  console.log(`WIKI_PARSE: rows=${merged.length} main_articles_total=${totalArticles}`);
  return merged;
}

export function applyNotesMap(rows, notesMap) {
  if (!notesMap || !rows) return rows;
  return rows.map((row) => {
    const key = normalizeWikiKey(row.name || row.link || "");
    if (!key || !notesMap.has(key)) return row;
    const htmlNotes = notesMap.get(key);
    if (!normalizeNotesText(htmlNotes)) return row;
    return {
      ...row,
      notes_text: normalizeNotesText(htmlNotes),
      notes_raw: typeof row.notes_raw === "string" ? row.notes_raw : String(row.notes_raw || "")
    };
  });
}

export function normalizeRowStatuses(row) {
  if (!row || typeof row !== "object") return row;
  const recreationalRaw =
    row.recreational_raw ?? row.recreational ?? row.recreational_status ?? "";
  const medicalRaw =
    row.medical_raw ?? row.medical ?? row.medical_status ?? "";
  const existingNotes = String(row.notes_text || "");
  const notesRaw = row.notes_raw ?? row.notes ?? "";
  const rawNotesText = notesTextFromRaw(notesRaw);
  const mainOnly = isMainOnlyRaw(notesRaw);
  let normalizedNotes = "";
  const rawHasDigits = /\d/.test(rawNotesText);
  const existingHasDigits = /\d/.test(existingNotes);
  const shouldPreferRaw =
    rawNotesText &&
    (!existingNotes ||
      (rawHasDigits && !existingHasDigits) ||
      rawNotesText.length > existingNotes.length);
  if (existingNotes && !isPlaceholderNote(existingNotes)) {
    normalizedNotes = shouldPreferRaw ? rawNotesText : existingNotes;
  } else if (rawNotesText && !mainOnly) {
    normalizedNotes = rawNotesText;
  }
  const name = String(row.name || row.link || "").trim();
  if (!normalizedNotes) {
    if (!mainOnly) {
      const articles = Array.isArray(row.notes_main_articles) ? row.notes_main_articles : [];
      const titles = Array.from(new Set(articles.map((article) => article?.title).filter(Boolean)));
      if (titles.length) {
        normalizedNotes = titles.join("; ");
      }
    } else {
      const articles = Array.isArray(row.notes_main_articles) ? row.notes_main_articles : [];
      const titles = Array.from(new Set(articles.map((article) => article?.title).filter(Boolean)));
      normalizedNotes = titles.length ? `Main article: ${titles.join("; ")}` : "Main article";
    }
  }
  return {
    ...row,
    recreational_status: parseRecreationalStatus(recreationalRaw),
    medical_status: parseMedicalStatus(medicalRaw),
    recreational_raw: recreationalRaw,
    medical_raw: medicalRaw,
    notes_text: normalizedNotes,
    notes_text_len: normalizedNotes.length
  };
}

export {
  extractMainArticles,
  extractNotesFromWikitextSections,
  isMainOnlyRaw,
  notesTextFromRaw,
  stripWikiMarkup
};
