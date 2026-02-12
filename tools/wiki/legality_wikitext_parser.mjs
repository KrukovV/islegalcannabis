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

function normalizeNotesParagraphs(lines) {
  const normalized = [];
  for (const line of lines) {
    const cleaned = String(line || "")
      .replace(/\u00a0/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    normalized.push(cleaned);
  }
  return normalized.join("\n\n").trim();
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

function extractExternalLinks(value) {
  const links = [];
  const text = String(value || "");
  const matches = text.matchAll(/\[https?:\/\/([^\s\]]+)(?:\s+[^\]]+)?\]/gi);
  for (const match of matches) {
    const url = `https://${String(match[1] || "").trim()}`;
    if (url.length > 8) links.push(url);
  }
  const bareMatches = text.matchAll(/https?:\/\/[^\s\]]+/gi);
  for (const match of bareMatches) {
    const url = String(match[0] || "").trim();
    if (url) links.push(url);
  }
  return Array.from(new Set(links));
}

function hasNormativeLink(text) {
  const links = extractExternalLinks(text);
  const keywords = /(act|law|code|regulation|statute|decree|ministry|government|parliament|legislation|justice|senate|gazette)/i;
  for (const link of links) {
    const host = link.replace(/^https?:\/\//, "").split("/")[0];
    if (/\.(gov|gob|mil)\b/i.test(host)) return true;
    if (/gov\.[a-z]{2,3}$/i.test(host)) return true;
    if (keywords.test(link)) return true;
  }
  const wikiLinks = extractWikiLinks(text);
  if (wikiLinks.some((title) => keywords.test(title))) return true;
  return false;
}

function hasTextualNotes(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.length < 120) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 12) return false;
  if (!/[.!?]/.test(text)) return false;
  return true;
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

function normalizeMainArticleLine(titles) {
  const list = Array.isArray(titles)
    ? Array.from(new Set(titles.map((title) => String(title || "").trim()).filter(Boolean)))
    : [];
  if (!list.length) return "";
  return `Main article: ${list.join("; ")}`;
}

function stripMainArticlePrefix(text, mainLine) {
  const normalized = normalizeNotesText(text);
  if (!normalized) return "";
  let remainder = normalized;
  if (mainLine) {
    const mainNormalized = normalizeNotesText(mainLine).replace(/\.$/, "");
    if (mainNormalized && remainder.startsWith(mainNormalized)) {
      remainder = remainder.slice(mainNormalized.length);
    }
  }
  if (/^Main articles?:/i.test(remainder)) {
    remainder = remainder.replace(/^Main articles?:\s*/i, "");
  }
  return normalizeNotesText(remainder.replace(/^[\.\s:-]+/, ""));
}

function deriveNotesFromRaw(rawNotes) {
  const notesRaw = String(rawNotes || "");
  const mainArticles = extractMainArticles(notesRaw);
  const mainLine = normalizeMainArticleLine(mainArticles.map((article) => article?.title || ""));
  const detailed = extractNotesFromWikitextSectionsDetailed(notesRaw);
  const detailedText = normalizeNotesText(detailed.text || "");
  const fallback = stripWikiMarkup(notesRaw);
  const fallbackRemainder = stripMainArticlePrefix(fallback, mainLine);
  const extraText = detailedText || fallbackRemainder;
  if (extraText) {
    const combined = [mainLine, extraText].filter(Boolean).join("\n\n").trim();
    return {
      notesText: combined,
      notesKind: "RICH",
      notesReasonCode: "HAS_EXTRA_TEXT",
      notesSectionsUsed: detailedText ? detailed.sectionsUsed : (combined ? ["notes_raw"] : []),
      notesMainArticle: detailed.mainArticle || (mainArticles[0]?.title || "")
    };
  }
  if (mainLine) {
    return {
      notesText: mainLine,
      notesKind: "MIN_ONLY",
      notesReasonCode: "NO_EXTRA_TEXT",
      notesSectionsUsed: ["main_article"],
      notesMainArticle: detailed.mainArticle || (mainArticles[0]?.title || "")
    };
  }
  return {
    notesText: "",
    notesKind: "NONE",
    notesReasonCode: "NO_WIKI_SECTION",
    notesSectionsUsed: [],
    notesMainArticle: detailed.mainArticle || ""
  };
}

const SECTION_PRIORITY = [
  "notes",
  "footnotes",
  "additional information",
  "see also",
  "further information",
  "примечания",
  "ссылки",
  "источники",
  "литература",
  "дополнительная информация",
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
  "enforcement",
  "references",
  "further reading",
  "external links",
  "bibliography",
  "sources"
];

function extractNotesFromWikitextSectionsDetailed(wikitext, priority = SECTION_PRIORITY) {
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
  const priorityMatch = (title) =>
    normalizedPriority.find((key) => normalizeNotesText(title).toLowerCase().includes(key)) || "";
  const cleanSectionBody = (body) => {
    const lines = String(body || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !line.startsWith("{{") &&
          !line.startsWith("|") &&
          !line.startsWith("{|") &&
          !line.startsWith("|}") &&
          !line.startsWith("!") &&
          !/\[\[\s*Category:/i.test(line) &&
          !/\{\{\s*portal/i.test(line) &&
          !/\{\{\s*navbox/i.test(line)
      );
    const stripped = stripWikiMarkup(lines.join("\n"));
    const paragraphs = stripped.split(/\r?\n/).map((line) => line.trim());
    return normalizeNotesParagraphs(paragraphs);
  };
  const extractMainArticleTitle = (body) => {
    const articles = extractMainArticles(body);
    return articles.length ? String(articles[0]?.title || "") : "";
  };
  const extractReferenceCandidates = (body) => {
    const titles = extractWikiLinks(body)
      .filter((title) => title && title.length < 120)
      .filter((title) => !/^Category:/i.test(title))
      .filter((title) => !/^Portal:/i.test(title))
      .filter((title) => !/^Template:/i.test(title))
      .slice(0, 6);
    if (!titles.length) return "";
    return normalizeNotesText(`References: ${titles.join("; ")}`);
  };
  let selected = {
    text: "",
    title: "",
    key: "",
    linkCount: 0,
    sectionsUsed: [],
    mainArticle: ""
  };
  for (const key of normalizedPriority) {
    const target = sections.find((section) =>
      normalizeNotesText(section.title).toLowerCase().includes(key)
    );
    if (!target) continue;
    const cleaned = cleanSectionBody(target.body);
    if (key === "see also" && !hasTextualNotes(cleaned)) {
      continue;
    }
    if (key === "references") {
      const refText = extractReferenceCandidates(target.body);
      if (refText) {
        selected = {
          text: refText,
          title: target.title,
          key,
          linkCount: extractWikiLinks(target.body).length,
          sectionsUsed: [key],
          mainArticle: extractMainArticleTitle(target.body)
        };
        break;
      }
      continue;
    }
    if (cleaned && !isPlaceholderNote(cleaned)) {
      selected = {
        text: cleaned,
        title: target.title,
        key,
        linkCount: extractWikiLinks(target.body).length,
        sectionsUsed: [key],
        mainArticle: extractMainArticleTitle(target.body)
      };
      break;
    }
  }
  const decisions = sections.map((section) => {
    const key = priorityMatch(section.title);
    const linkCount = extractWikiLinks(section.body).length;
    const cleaned = cleanSectionBody(section.body);
    const textLen = cleaned.length;
    let reason = "NO_PRIORITY_MATCH";
    let included = false;
    if (key) {
      if (!cleaned) {
        reason = "EMPTY";
      } else if (key === "see also" && !hasTextualNotes(cleaned)) {
        reason = "SEE_ALSO_NO_TEXT";
      } else if (isPlaceholderNote(cleaned)) {
        reason = "PLACEHOLDER";
      } else if (key === "references" && !extractReferenceCandidates(section.body)) {
        reason = "REFERENCES_NO_CANDIDATES";
      } else if (selected.title && selected.title === section.title) {
        reason = "INCLUDED";
        included = true;
      } else {
        reason = "SECONDARY_MATCH";
      }
    }
    return {
      title: section.title,
      key,
      included,
      reason,
      linkCount,
      textLen
    };
  });
  return {
    text: selected.text,
    title: selected.title,
    key: selected.key,
    linkCount: selected.linkCount,
    sectionsUsed: selected.sectionsUsed || [],
    mainArticle: selected.mainArticle || "",
    decisions
  };
}

function extractNotesFromWikitextSections(wikitext, priority = SECTION_PRIORITY) {
  const detailed = extractNotesFromWikitextSectionsDetailed(wikitext, priority);
  return detailed.text || "";
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
    const mainArticles = extractMainArticles(notesRaw);
    const derived = deriveNotesFromRaw(notesRaw);
    return {
      name: row.name,
      link: row.link,
      wiki_row_url: buildWikiUrl(row.link || row.name || ""),
      recreational_status: parseRecreationalStatus(row.recreational),
      medical_status: parseMedicalStatus(row.medical),
      recreational_raw: row.recreational,
      medical_raw: row.medical,
      notes_raw: notesRaw,
      notes_text: derived.notesText,
      notes_main_articles: mainArticles,
      notes_sections_used: derived.notesSectionsUsed,
      notes_main_article: derived.notesMainArticle,
      notes_kind: derived.notesKind,
      notes_reason_code: derived.notesReasonCode
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
  let normalizedNotes = "";
  const derived = deriveNotesFromRaw(notesRaw);
  if (existingNotes && !isPlaceholderNote(existingNotes)) {
    normalizedNotes = existingNotes;
  } else {
    normalizedNotes = derived.notesText;
  }
  return {
    ...row,
    recreational_status: parseRecreationalStatus(recreationalRaw),
    medical_status: parseMedicalStatus(medicalRaw),
    recreational_raw: recreationalRaw,
    medical_raw: medicalRaw,
    notes_text: normalizedNotes,
    notes_text_len: normalizedNotes.length,
    notes_sections_used: Array.isArray(row.notes_sections_used) && row.notes_sections_used.length
      ? row.notes_sections_used
      : derived.notesSectionsUsed,
    notes_main_article: row.notes_main_article || derived.notesMainArticle,
    notes_kind: row.notes_kind || derived.notesKind,
    notes_reason_code: row.notes_reason_code || derived.notesReasonCode
  };
}

export {
  deriveNotesFromRaw,
  extractMainArticles,
  extractNotesFromWikitextSections,
  extractNotesFromWikitextSectionsDetailed,
  isMainOnlyRaw,
  notesTextFromRaw,
  stripWikiMarkup
};
