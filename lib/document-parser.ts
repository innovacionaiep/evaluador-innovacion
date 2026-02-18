import path from "path";
import fs from "fs";

// Dynamic imports for CJS/ESM modules
async function loadPdfParse() {
  const pdfParse = await import("pdf-parse");
  return pdfParse.default;
}

export async function extractTextFromFile(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) return "";
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === ".pdf") {
      const pdfParse = await loadPdfParse();
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return (data?.text ?? "").trim();
    }
    if (ext === ".docx" || ext === ".doc") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ path: filePath });
      return (result?.value ?? "").trim();
    }
    if (ext === ".xlsx" || ext === ".xls") {
      const ExcelJS = await import("exceljs");
      const Workbook = (ExcelJS as { default?: unknown }).default ?? ExcelJS;
      const workbook = new (Workbook as new () => { xlsx: { readFile: (p: string) => Promise<void> }; worksheets: { name: string; eachRow: (cb: (row: { values: (string | number | undefined)[] }) => void) => void }[] })();
      await workbook.xlsx.readFile(filePath);
      const parts: string[] = [];
      workbook.worksheets.forEach((sheet) => {
        const rows: string[] = [];
        sheet.eachRow((row) => {
          const cells = row.values as (string | number | undefined)[];
          if (cells && cells.length > 1) rows.push(cells.slice(1).map((c) => String(c ?? "")).join("\t"));
        });
        if (rows.length) parts.push(`[Hoja: ${sheet.name}]\n${rows.join("\n")}`);
      });
      return parts.join("\n\n").trim();
    }
    if (ext === ".pptx" || ext === ".ppt") {
      return "[Presentación PPT/PPTX: extracción de texto no implementada. Use PDF o DOCX para el contenido.]";
    }
    // Plain text
    if ([".txt", ".md", ".json"].includes(ext)) {
      return fs.readFileSync(filePath, "utf-8").trim();
    }
  } catch (err) {
    return `[Error extrayendo texto: ${err instanceof Error ? err.message : String(err)}]`;
  }

  return "[Formato no soportado para extracción de texto]";
}

export function getSupportedExtensions(): string[] {
  return [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".txt", ".md", ".json"];
}
