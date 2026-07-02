import type { ExcelSheet } from "@/lib/excel-structured-extract";
import type { ElementDef } from "@/lib/excel-heuristics";
import { normalizeForMatch } from "@/lib/text-match";
import { sortSheetsByPriority } from "@/lib/excel-sheet-priority";

export const GANTT_SHEET_RE = /gantt|cronograma|carta\s*gantt|plan\s+de\s+actividad/i;

export function isGanttSheetName(sheetName: string): boolean {
  return GANTT_SHEET_RE.test(normalizeForMatch(sheetName));
}

function elementContextText(element: { title: string; description?: string; section?: string }): string {
  return normalizeForMatch(`${element.title} ${element.section ?? ""} ${element.description ?? ""}`);
}
const INDICATORS_SHEET_RE = /indicador/i;
const RESUMEN_SHEET_RE = /resumen|ficha|informaci[oó]n\s*general/i;

export function isGanttActivitiesElement(element: {
  title: string;
  description?: string;
  section?: string;
}): boolean {
  const t = elementContextText(element);
  return (
    (/actividad/.test(t) && /gantt|cronograma|plan\s+de\s+actividad/.test(t)) ||
    t.includes("actividades del proyecto")
  );
}

export function isIndicatorsTableElement(element: { title: string; description?: string }): boolean {
  const t = normalizeForMatch(`${element.title} ${element.description ?? ""}`);
  if (/metodolog/.test(t) && /medici/.test(t)) return false;
  return /^indicador/.test(t) || (t.includes("indicador") && !t.includes("metodolog"));
}

export function isResumenFormElement(element: { title: string; description?: string }): boolean {
  const t = normalizeForMatch(`${element.title} ${element.description ?? ""}`);
  if (isGanttActivitiesElement(element) || isIndicatorsTableElement(element)) return false;
  return (
    /sostenibilidad|escalabilidad|factor innovador|ejes?\s+de\s+impacto|focalizaci|resultados|contribuci|desarrollo sostenible|ods\b/.test(
      t
    ) || /necesidad|problema|pertinencia|publico|genero|consiste la soluci/.test(t)
  );
}

/** Ordena hojas según el elemento: Gantt/Indicadores primero cuando corresponde. */
export function sheetsForElement(element: ElementDef, sheets: ExcelSheet[]): ExcelSheet[] {
  const n = (s: ExcelSheet) => normalizeForMatch(s.sheetName);

  if (isGanttActivitiesElement(element)) {
    const gantt = sheets.filter((s) => GANTT_SHEET_RE.test(n(s)));
    if (gantt.length > 0) return gantt;
  }

  if (isIndicatorsTableElement(element)) {
    const ind = sheets.filter((s) => INDICATORS_SHEET_RE.test(n(s)));
    if (ind.length > 0) return ind;
  }

  if (isResumenFormElement(element)) {
    const resumen = sheets.filter((s) => RESUMEN_SHEET_RE.test(n(s)));
    const rest = sheets.filter((s) => !RESUMEN_SHEET_RE.test(n(s)));
    if (resumen.length > 0) return [...resumen, ...sortSheetsByPriority(rest)];
  }

  return sortSheetsByPriority(sheets);
}
