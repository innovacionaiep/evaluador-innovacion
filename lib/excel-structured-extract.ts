import path from "path";
import fs from "fs";
import { extractTextFromFile } from "@/lib/document-parser";

export type ExcelCell = { row: number; col: number; value: string };
export type ExcelMerge = { startRow: number; startCol: number; endRow: number; endCol: number };
export type ExcelSheet = {
  sheetName: string;
  cells: ExcelCell[];
  merges: ExcelMerge[];
};
export type ExcelStructuredData = {
  fileName: string;
  sheets: ExcelSheet[];
};

function cellToStr(c: unknown): string {
  if (c == null) return "";
  if (typeof c === "string" || typeof c === "number") return String(c).trim();
  if (typeof c === "object") {
    const o = c as { text?: string; hyperlink?: string; richText?: unknown[] };
    if (typeof o.text === "string") return o.text.trim();
    if (typeof o.hyperlink === "string") return o.hyperlink.trim();
    if (Array.isArray(o.richText) && o.richText.length > 0) {
      return o.richText
        .map((t: unknown) => (typeof t === "object" && t != null && "text" in t ? String((t as { text: string }).text) : ""))
        .join("")
        .trim();
    }
  }
  return "";
}

/** Convierte texto plano (p. ej. .xls vía document-parser) a celdas etiqueta→valor. */
export function plainTextToStructuredData(fileName: string, text: string, sheetName = "Hoja 1"): ExcelStructuredData {
  const cells: ExcelCell[] = [];
  let row = 1;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("[Hoja:")) {
      if (trimmed.startsWith("[Hoja:")) row += 1;
      continue;
    }
    const colonIdx = trimmed.indexOf(": ");
    if (colonIdx > 0) {
      cells.push({ row, col: 1, value: trimmed.slice(0, colonIdx).trim() });
      cells.push({ row, col: 2, value: trimmed.slice(colonIdx + 2).trim() });
    } else {
      cells.push({ row, col: 1, value: trimmed });
    }
    row += 1;
  }
  return {
    fileName,
    sheets: cells.length > 0 ? [{ sheetName, cells, merges: [] }] : [],
  };
}

/**
 * Extracts Excel (.xlsx) to structured JSON with cell coordinates and merge ranges.
 * For .xls, builds pseudo-structure from plain-text label:value rows.
 */
export async function extractExcelToStructuredJson(filePath: string): Promise<ExcelStructuredData> {
  if (!fs.existsSync(filePath)) {
    return { fileName: path.basename(filePath), sheets: [] };
  }
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  if (ext === ".xls") {
    const text = await extractTextFromFile(filePath);
    if (!text || text.startsWith("[")) {
      return { fileName, sheets: [] };
    }
    return plainTextToStructuredData(fileName, text);
  }

  if (ext !== ".xlsx") {
    return { fileName, sheets: [] };
  }

  const ExcelJS = await import("exceljs");
  const mod = (ExcelJS as { default?: { Workbook?: unknown }; Workbook?: unknown }).default ?? ExcelJS;
  const Workbook = mod.Workbook as new () => {
    xlsx: { readFile: (p: string) => Promise<void> };
    worksheets: {
      name: string;
      eachRow: (opts: { includeEmpty: boolean }, cb: (row: {
        number: number;
        values: unknown[];
        getCell: (col: number) => { value: unknown };
      }) => void) => void;
      _merges?: Record<string, { top: number; left: number; bottom: number; right: number }>;
    }[];
  };
  const workbook = new Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheets: ExcelSheet[] = [];
  const sheetsToUse = workbook.worksheets;
  for (const sheet of sheetsToUse) {
    const cells: ExcelCell[] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as unknown[];
      if (!values || values.length < 1) return;
      const rowNum = row.number;
      for (let col = 1; col < values.length; col++) {
        const raw = values[col];
        const value = cellToStr(raw);
        if (value.length > 0) {
          cells.push({ row: rowNum, col, value });
        }
      }
    });
    const merges: ExcelMerge[] = [];
    const mergesObj = (sheet as unknown as { _merges?: Record<string, { top: number; left: number; bottom: number; right: number }> })._merges;
    if (mergesObj && typeof mergesObj === "object") {
      for (const dimensions of Object.values(mergesObj)) {
        if (dimensions && typeof dimensions.top === "number" && typeof dimensions.left === "number") {
          merges.push({
            startRow: dimensions.top,
            startCol: dimensions.left,
            endRow: typeof dimensions.bottom === "number" ? dimensions.bottom : dimensions.top,
            endCol: typeof dimensions.right === "number" ? dimensions.right : dimensions.left,
          });
        }
      }
    }
    sheets.push({ sheetName: sheet.name, cells, merges });
  }
  return { fileName, sheets };
}
