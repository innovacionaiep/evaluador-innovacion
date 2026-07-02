import type { ExcelSheet, ExcelStructuredData } from "@/lib/excel-structured-extract";
import { normalizeForMatch } from "@/lib/text-match";
import { isGanttColumnHeaderLabel, isLikelyGanttHeaderRowContent } from "@/lib/excel-sheet-priority";
import { isGanttActivitiesElement, isGanttSheetName } from "@/lib/sheet-element-routing";

function buildCellMap(cells: ExcelSheet["cells"]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of cells) {
    map.set(`${c.row},${c.col}`, c.value.trim());
  }
  return map;
}

function isNumericOnly(value: string): boolean {
  return /^\d+([.,]\d+)?$/.test(value.trim());
}

function isSubTaskLabel(value: string): boolean {
  const n = normalizeForMatch(value);
  return /^tareas?\b/.test(n) || /^subtarea/.test(n) || n === "aaa";
}

type NameDescColumns = { nameCol: number; descCol: number; headerRow: number };

function resolveNameDescriptionColumns(sheet: ExcelSheet): NameDescColumns | null {
  const map = buildCellMap(sheet.cells);
  const rows = [...new Set(sheet.cells.map((c) => c.row))].sort((a, b) => a - b);
  const cols = [...new Set(sheet.cells.map((c) => c.col))].sort((a, b) => a - b);

  for (const row of rows.slice(0, 12)) {
    let nameCol = -1;
    let descCol = -1;

    for (const col of cols) {
      const v = map.get(`${row},${col}`) ?? "";
      if (!v || v.length > 100) continue;
      const n = normalizeForMatch(v);
      if (/nombre.*actividad/.test(n) || (n.includes("nombre") && n.includes("actividad"))) {
        nameCol = col;
      }
      if (/descripci.*actividad/.test(n) || (n.includes("descripci") && n.includes("actividad"))) {
        descCol = col;
      }
    }

    if (nameCol >= 0) {
      if (descCol < 0) {
        const candidate = cols.find((c) => c > nameCol && c <= nameCol + 3);
        descCol = candidate ?? nameCol + 1;
      }
      return { nameCol, descCol, headerRow: row };
    }
  }

  return null;
}

function formatActivityLine(name: string, description: string): string {
  const n = name.trim();
  const d = description.trim();
  if (!n) return "";
  if (!d) return n;
  return `${n}\n   Descripción: ${d}`;
}

function extractNameDescriptionActivities(sheet: ExcelSheet): string[] {
  const map = buildCellMap(sheet.cells);
  const rows = [...new Set(sheet.cells.map((c) => c.row))].sort((a, b) => a - b);
  const columns = resolveNameDescriptionColumns(sheet);

  if (!columns) return [];

  const { nameCol, descCol, headerRow } = columns;
  const activities: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row <= headerRow) continue;

    const name = map.get(`${row},${nameCol}`) ?? "";
    const description = map.get(`${row},${descCol}`) ?? "";

    if (!name || name.length < 3) continue;
    if (isNumericOnly(name)) continue;
    if (isSubTaskLabel(name)) continue;
    if (isGanttColumnHeaderLabel(name)) continue;
    if (isLikelyGanttHeaderRowContent(name)) continue;
    if (/ISO\s*50001|norma\s+ISO/i.test(name)) continue;

    const line = formatActivityLine(name, description);
    if (line.length < 5) continue;

    const key = normalizeForMatch(line);
    if (seen.has(key)) continue;
    seen.add(key);
    activities.push(line);
  }

  return activities.slice(0, 50);
}

/** Contexto de la hoja Gantt: solo nombre y descripción de actividad (sin tareas, fechas, etc.). */
export function getGanttSheetContext(structuredFiles: ExcelStructuredData[]): string | null {
  for (const file of structuredFiles) {
    for (const sheet of file.sheets) {
      if (!isGanttSheetName(sheet.sheetName)) continue;

      const activities = extractNameDescriptionActivities(sheet);
      if (activities.length > 0) {
        const parts = [
          `Hoja: ${sheet.sheetName}`,
          "Solo columnas: Nombre de actividad y Descripción de actividad.",
          "",
          ...activities.map((a, i) => `--- Actividad ${i + 1} ---\n${a}`),
        ];
        return parts.join("\n");
      }

      const map = buildCellMap(sheet.cells);
      const columns = resolveNameDescriptionColumns(sheet);
      if (!columns) continue;

      const rows = [...new Set(sheet.cells.map((c) => c.row))].sort((a, b) => a - b);
      const parts: string[] = [`Hoja: ${sheet.sheetName}`];
      for (const row of rows) {
        if (row <= columns.headerRow) continue;
        const name = map.get(`${row},${columns.nameCol}`) ?? "";
        const desc = map.get(`${row},${columns.descCol}`) ?? "";
        if (!name) continue;
        parts.push(`Fila ${row} — Nombre: ${name}${desc ? ` | Descripción: ${desc}` : ""}`);
      }
      if (parts.length > 1) return parts.join("\n");
    }
  }
  return null;
}

export function extractGanttActivitiesFromExcel(
  structuredFiles: ExcelStructuredData[],
  element: { title: string; description?: string; section?: string }
): { content: string; confidence: number } | null {
  if (!isGanttActivitiesElement(element)) return null;

  for (const file of structuredFiles) {
    for (const sheet of file.sheets) {
      if (!isGanttSheetName(sheet.sheetName)) continue;
      const activities = extractNameDescriptionActivities(sheet);
      if (activities.length >= 1) {
        return {
          content: activities.map((a, i) => `${i + 1}. ${a}`).join("\n\n"),
          confidence: 0.93,
        };
      }
    }
  }
  return null;
}
