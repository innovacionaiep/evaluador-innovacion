import path from "path";
import fs from "fs";
import { extractTextFromFile, extractPdfPages } from "@/lib/document-parser";
import { extractExcelToStructuredJson, type ExcelSheet } from "@/lib/excel-structured-extract";
import { getProjectVectorsDir } from "@/lib/storage";

const STRUCTURED_FILE = "project-structured.json";
const VISION_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export type ProjectFileType = "excel" | "pdf" | "docx" | "image" | "text";

export type ProjectStructuredFile = {
  fileName: string;
  type: ProjectFileType;
  sheets?: ExcelSheet[];
  pages?: Array<{ page: number; text: string }>;
  sections?: Array<{ heading?: string; text: string }>;
};

export type ProjectStructuredIndex = {
  indexedAt: string;
  filePaths: string[];
  files: ProjectStructuredFile[];
};

function structuredPath(sessionId: string): string {
  return path.join(getProjectVectorsDir(sessionId), STRUCTURED_FILE);
}

function splitTextIntoSections(text: string): Array<{ heading?: string; text: string }> {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return [];
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const first = lines[0]?.trim() ?? "";
    if (lines.length > 1 && first.length > 0 && first.length <= 80 && !first.endsWith(".")) {
      return { heading: first, text: lines.slice(1).join("\n").trim() || first };
    }
    return { text: block };
  });
}

async function parseFileToStructured(filePath: string): Promise<ProjectStructuredFile | null> {
  if (!fs.existsSync(filePath)) return null;
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".xlsx" || ext === ".xls") {
    try {
      const data = await extractExcelToStructuredJson(filePath);
      if (data.sheets.length === 0) return null;
      return { fileName, type: "excel", sheets: data.sheets };
    } catch {
      const text = await extractTextFromFile(filePath);
      if (!text || text.startsWith("[")) return null;
      return { fileName, type: "text", sections: splitTextIntoSections(text) };
    }
  }

  if (ext === ".pdf") {
    const pages = await extractPdfPages(filePath);
    if (pages.length > 0) {
      return { fileName, type: "pdf", pages };
    }
    const text = await extractTextFromFile(filePath);
    if (!text || text.startsWith("[")) return null;
    return { fileName, type: "pdf", pages: [{ page: 1, text }] };
  }

  if (ext === ".docx" || ext === ".doc") {
    const text = await extractTextFromFile(filePath);
    if (!text || text.startsWith("[")) return null;
    return { fileName, type: "docx", sections: splitTextIntoSections(text) };
  }

  if (VISION_EXTS.has(ext)) {
    const { extractTextWithVision } = await import("@/lib/extract-with-vision");
    const text = await extractTextWithVision(filePath);
    if (!text || text.startsWith("[")) return null;
    return { fileName, type: "image", sections: [{ text }] };
  }

  const plain = await extractTextFromFile(filePath);
  if (!plain || plain.startsWith("[")) return null;
  return { fileName, type: "text", sections: splitTextIntoSections(plain) };
}

/** Construye índice estructurado técnico de los archivos del proyecto. */
export async function buildProjectStructuredIndex(filePaths: string[]): Promise<ProjectStructuredIndex> {
  const validPaths = filePaths.filter((p) => p && fs.existsSync(p));
  const files: ProjectStructuredFile[] = [];
  for (const filePath of validPaths) {
    const parsed = await parseFileToStructured(filePath);
    if (parsed) files.push(parsed);
  }
  return {
    indexedAt: new Date().toISOString(),
    filePaths: validPaths,
    files,
  };
}

export function saveProjectStructuredIndex(sessionId: string, index: ProjectStructuredIndex): void {
  const dir = getProjectVectorsDir(sessionId);
  fs.writeFileSync(path.join(dir, STRUCTURED_FILE), JSON.stringify(index), "utf-8");
}

export function loadProjectStructuredIndex(sessionId: string): ProjectStructuredIndex | null {
  const p = structuredPath(sessionId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ProjectStructuredIndex;
  } catch {
    return null;
  }
}

export function hasProjectStructuredIndex(sessionId: string): boolean {
  const index = loadProjectStructuredIndex(sessionId);
  return !!index?.files?.length;
}

export function clearProjectStructuredIndex(sessionId: string): void {
  const p = structuredPath(sessionId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function structuredIndexMatches(sessionId: string, filePaths: string[]): boolean {
  const index = loadProjectStructuredIndex(sessionId);
  if (!index?.filePaths?.length) return false;
  const norm = (paths: string[]) =>
    [...paths].map((p) => path.normalize(p).toLowerCase()).sort();
  const a = norm(filePaths);
  const b = norm(index.filePaths);
  return a.length === b.length && a.every((p, i) => p === b[i]);
}
