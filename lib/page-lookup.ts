import { loadChunksAsync, type StoredChunk } from "@/lib/vector-store";

export type PageChunk = StoredChunk & { score: number };

/** Normaliza pipes Unicode (│) y espacios del PDF Oslo. */
export function normalizeDocText(text: string): string {
  return text
    .replace(/\u2502/g, "|")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ +\n/g, "\n");
}

function parseChunkIndex(id: string): number {
  const m = id.match(/-(\d+)$/);
  return m ? Number(m[1]) : -1;
}

/** Línea de índice (tabla de contenidos) con puntos suspensivos y número al final. */
function isTocLine(line: string): boolean {
  return /\.{4,}\s*\d{1,4}\s*$/.test(line.trim());
}

/**
 * Detecta el número de página impresa (cabecera "CHAPTER ... | 201" o "│ 201").
 */
export function detectPrintedPageInText(text: string, fallbackPdfPage?: number): number | undefined {
  const norm = normalizeDocText(text);

  const headerMatch = norm.match(/CHAPTER[^\n]{0,220}\|\s*(\d{1,4})\s*(?:\n|$)/i);
  if (headerMatch) return Number(headerMatch[1]);

  const pipeMatches = [...norm.matchAll(/\|\s*(\d{1,4})\s*(?:\n|$)/g)];
  if (pipeMatches.length > 0) {
    return Number(pipeMatches[pipeMatches.length - 1][1]);
  }

  const tocEnd = norm.match(/\.{4,}\s*(\d{1,4})\s*$/m);
  if (tocEnd) return Number(tocEnd[1]);

  return fallbackPdfPage;
}

/**
 * Secciones del índice que apuntan a una página (líneas "9.7.3. Title .... 201").
 */
export function tocSectionTitlesForPage(text: string, targetPage: number): string[] {
  const norm = text.replace(/\u2502/g, "|");
  const titles: string[] = [];
  const re = new RegExp(`^(.+?)\\.{4,}\\s*${targetPage}\\s*$`, "gm");
  for (const m of norm.matchAll(re)) {
    const t = m[1].trim();
    if (t.length > 3) titles.push(t);
  }
  return titles;
}

function chunkHasSubstantiveContent(text: string): boolean {
  const norm = normalizeDocText(text);
  if (norm.length < 80) return false;
  if (/\b\d+\.\d{3}\.\s/.test(norm)) return true;
  if (/\b\d+\.\d+\.\d+\.\s/.test(norm) && !isTocLine(norm)) return true;
  const lines = text.split(/\r?\n/);
  return lines.some((l) => l.trim().length > 60 && !isTocLine(l));
}

/**
 * ¿El chunk contiene contenido de la página impresa (no solo una línea del índice)?
 */
export function chunkMatchesPrintedPage(text: string, targetPage: number): boolean {
  const norm = text.replace(/\u2502/g, "|");
  const p = targetPage;

  if (new RegExp(`CHAPTER[^\\n]{0,220}\\|\\s*${p}\\b`, "i").test(norm)) return true;

  const titlesOnPage = tocSectionTitlesForPage(text, p);
  if (titlesOnPage.length > 0 && chunkHasSubstantiveContent(text)) {
    for (const title of titlesOnPage) {
      const short = title.replace(/\.{2,}$/, "").trim();
      const sectionNum = short.match(/^(\d+\.\d+(?:\.\d+)?)/)?.[1];
      if (sectionNum && norm.includes(sectionNum) && chunkHasSubstantiveContent(text)) return true;
      if (short.length > 8 && norm.includes(short.slice(0, Math.min(40, short.length)))) return true;
    }
  }

  if (new RegExp(`\\.{4,}\\s*${p}\\s*$`, "m").test(norm) && chunkHasSubstantiveContent(text)) return true;

  return false;
}

function collectAnchorIndices(all: StoredChunk[], targetPage: number): Set<number> {
  const anchors = new Set<number>();
  const p = targetPage;

  // Señal principal: cabecera de capítulo con página impresa (│ 201 en el Manual Oslo).
  for (const c of all) {
    const norm = c.text.replace(/\u2502/g, "|");
    const idx = parseChunkIndex(c.id);
    if (idx < 0) continue;
    if (new RegExp(`CHAPTER[^\\n]{0,220}\\|\\s*${p}\\b`, "i").test(norm)) {
      anchors.add(idx);
    }
    if (c.printedPage === p && chunkHasSubstantiveContent(c.text)) {
      anchors.add(idx);
    }
  }

  // Sin cabecera CHAPTER: enlazar secciones del índice (.... 201) con párrafos numerados (9.137).
  if (anchors.size === 0) {
    const sectionNums = new Set<string>();
    for (const c of all) {
      for (const title of tocSectionTitlesForPage(c.text, p)) {
        const num = title.match(/^(\d+\.\d+(?:\.\d+)?)/)?.[1];
        if (num) sectionNums.add(num);
      }
    }
    for (const c of all) {
      if (!chunkHasSubstantiveContent(c.text)) continue;
      const idx = parseChunkIndex(c.id);
      for (const num of sectionNums) {
        if (c.text.includes(num) && /\b\d+\.\d{3}\.\s/.test(c.text)) {
          anchors.add(idx);
        }
      }
    }
  }

  const expanded = new Set<number>();
  for (const idx of anchors) {
    for (let d = -1; d <= 5; d++) {
      if (idx + d >= 0) expanded.add(idx + d);
    }
  }
  return expanded;
}

/**
 * Recupera chunks de una página impresa del manual Oslo.
 */
export async function retrieveChunksForPrintedPage(
  evaluationTypeId: number,
  targetPage: number,
  maxChars: number
): Promise<PageChunk[]> {
  const all = await loadChunksAsync(evaluationTypeId);
  if (all.length === 0) return [];

  const anchorIndices = collectAnchorIndices(all, targetPage);

  let matched: StoredChunk[] = [];

  if (anchorIndices.size > 0) {
    matched = all.filter((c) => anchorIndices.has(parseChunkIndex(c.id)));
  }

  if (matched.length === 0) {
    matched = all.filter(
      (c) =>
        c.printedPage === targetPage ||
        c.page === targetPage ||
        chunkMatchesPrintedPage(c.text, targetPage)
    );
  }

  if (matched.length === 0) {
    for (const delta of [-2, -1, 1, 2]) {
      const alt = targetPage + delta;
      matched = all.filter(
        (c) =>
          c.printedPage === alt ||
          new RegExp(`\\|\\s*${alt}\\b`).test(c.text.replace(/\u2502/g, "|"))
      );
      if (matched.length > 0) break;
    }
  }

  matched = [...new Map(matched.map((c) => [c.id, c])).values()];
  matched.sort((a, b) => parseChunkIndex(a.id) - parseChunkIndex(b.id));

  const out: PageChunk[] = [];
  let total = 0;
  for (const c of matched) {
    if (total + c.text.length > maxChars && out.length > 0) break;
    out.push({ ...c, score: 1 });
    total += c.text.length;
  }
  return out;
}
