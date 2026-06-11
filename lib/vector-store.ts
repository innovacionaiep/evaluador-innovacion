import path from "path";
import fs from "fs";
import { getVectorsDir } from "@/lib/storage";

export type StoredChunk = {
  id: string;
  docName: string;
  text: string;
  embedding: number[];
  /** Número de página del PDF (1-based), si está disponible. */
  page?: number;
  /** Número de página impresa en el documento (cabecera Oslo: | 201). */
  printedPage?: number;
};

const CHUNKS_FILE = "chunks.json";
const META_FILE = "meta.json";

export function saveChunks(
  evaluationTypeId: number,
  chunks: StoredChunk[],
  meta?: { indexedAt: string; knowledgeVersion?: string }
): void {
  const dir = getVectorsDir(evaluationTypeId);
  const chunksPath = path.join(dir, CHUNKS_FILE);
  fs.writeFileSync(chunksPath, JSON.stringify(chunks), "utf-8");
  if (meta) {
    fs.writeFileSync(path.join(dir, META_FILE), JSON.stringify(meta), "utf-8");
  }
}

export function loadChunks(evaluationTypeId: number): StoredChunk[] {
  const dir = getVectorsDir(evaluationTypeId);
  const chunksPath = path.join(dir, CHUNKS_FILE);
  if (!fs.existsSync(chunksPath)) return [];
  try {
    const raw = fs.readFileSync(chunksPath, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function hasChunks(evaluationTypeId: number): boolean {
  const chunks = loadChunks(evaluationTypeId);
  return chunks.length > 0;
}

