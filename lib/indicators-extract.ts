import type { ExcelSheet, ExcelStructuredData } from "@/lib/excel-structured-extract";
import { normalizeForMatch } from "@/lib/text-match";
import { isIndicatorsTableElement } from "@/lib/sheet-element-routing";

function buildCellMap(cells: ExcelSheet["cells"]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of cells) {
    map.set(`${c.row},${c.col}`, c.value.trim());
  }
  return map;
}

function findHeaderRow(sheet: ExcelSheet): { row: number; headers: Map<number, string> } | null {
  const map = buildCellMap(sheet.cells);
  const rows = [...new Set(sheet.cells.map((c) => c.row))].sort((a, b) => a - b);
  const cols = [...new Set(sheet.cells.map((c) => c.col))].sort((a, b) => a - b);

  let bestRow = -1;
  let bestScore = 0;
  let bestHeaders = new Map<number, string>();

  for (const row of rows.slice(0, 12)) {
    const headers = new Map<number, string>();
    let score = 0;
    for (const col of cols) {
      const v = map.get(`${row},${col}`) ?? "";
      if (!v || v.length > 80) continue;
      const n = normalizeForMatch(v);
      if (/indicador|objetivo|meta|medici|verificaci|evidencia|cumplimiento|avance|calculo|cálculo|resultado|descripci/.test(n)) {
        score += 1;
        headers.set(col, v);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
      bestHeaders = headers;
    }
  }

  if (bestRow < 0 || bestHeaders.size === 0) return null;
  return { row: bestRow, headers: bestHeaders };
}

function headerForCol(headers: Map<number, string>, col: number): string {
  let best = headers.get(col);
  if (best) return best;
  let nearest = Infinity;
  for (const [c, label] of headers) {
    const d = Math.abs(c - col);
    if (d < nearest) {
      nearest = d;
      best = label;
    }
  }
  return best ?? `Columna ${col}`;
}

function formatIndicatorSheetAsStructuredText(sheet: ExcelSheet): string {
  const map = buildCellMap(sheet.cells);
  const rows = [...new Set(sheet.cells.map((c) => c.row))].sort((a, b) => a - b);
  const cols = [...new Set(sheet.cells.map((c) => c.col))].sort((a, b) => a - b);
  const headerInfo = findHeaderRow(sheet);

  const parts: string[] = [`Hoja: ${sheet.sheetName}`];

  if (headerInfo) {
    const headerLine = [...headerInfo.headers.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([col, label]) => `${label} (col ${col})`)
      .join(" | ");
    parts.push(`Encabezados (fila ${headerInfo.row}): ${headerLine}`);
    parts.push("");
  }

  const startRow = headerInfo ? headerInfo.row + 1 : rows[0] ?? 1;
  let block = 0;

  for (const row of rows) {
    if (row < startRow) continue;
    const fields: string[] = [];
    for (const col of cols) {
      const v = map.get(`${row},${col}`) ?? "";
      if (!v) continue;
      const label = headerInfo ? headerForCol(headerInfo.headers, col) : `Col ${col}`;
      fields.push(`${label}: ${v}`);
    }
    if (fields.length === 0) continue;

    const joined = fields.join("\n");
    const isMetaOnly = /^meta\s*:/i.test(fields[0] ?? "") && fields.length <= 3;
    if (isMetaOnly) {
      parts.push(`--- Meta (fila ${row}) ---\n${joined}`);
      continue;
    }

    block += 1;
    parts.push(`--- Registro ${block} (fila ${row}) ---\n${joined}`);
    parts.push("");
  }

  return parts.join("\n").trim();
}

/** Contexto legible de la hoja Indicadores para el LLM (no es la salida final). */
export function getIndicatorsSheetContext(structuredFiles: ExcelStructuredData[]): string | null {
  for (const file of structuredFiles) {
    for (const sheet of file.sheets) {
      if (!/indicador/i.test(normalizeForMatch(sheet.sheetName))) continue;
      const text = formatIndicatorSheetAsStructuredText(sheet);
      if (text.length >= 20) return text;
    }
  }
  return null;
}

/** @deprecated Solo para tests internos; la salida final debe pasar por LLM. */
export function extractIndicatorsFromExcel(
  structuredFiles: ExcelStructuredData[],
  element: { title: string; description?: string }
): { content: string; confidence: number } | null {
  if (!isIndicatorsTableElement(element)) return null;
  const context = getIndicatorsSheetContext(structuredFiles);
  if (!context) return null;
  return { content: context, confidence: 0.5 };
}
