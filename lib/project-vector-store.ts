import path from "path";
import { getProjectVectorsDir } from "@/lib/storage";
import {
  loadChunksFromStore,
  loadMetaFromStore,
  saveChunksToStore,
  type ChunkStoreConfig,
} from "@/lib/chunk-store";
import {
  clearProjectStructuredIndex,
  hasProjectStructuredIndex,
  structuredIndexMatches,
} from "@/lib/project-structured-index";
import type { StoredChunk } from "@/lib/vector-store";

const CHUNKS_FILE = "project-chunks.json";
const META_FILE = "project-meta.json";

export type ProjectIndexMeta = {
  indexedAt: string;
  filePaths?: string[];
};

function storeConfig(sessionId: string): ChunkStoreConfig {
  return {
    kind: "project",
    id: sessionId,
    dir: getProjectVectorsDir(sessionId),
    chunksFile: CHUNKS_FILE,
    metaFile: META_FILE,
  };
}

export function saveProjectChunks(
  sessionId: string,
  chunks: StoredChunk[],
  meta?: ProjectIndexMeta
): void {
  saveChunksToStore(storeConfig(sessionId), chunks, meta);
}

export function loadProjectChunks(sessionId: string): StoredChunk[] {
  return loadChunksFromStore(storeConfig(sessionId));
}

export function loadProjectIndexMeta(sessionId: string): ProjectIndexMeta | null {
  return loadMetaFromStore<ProjectIndexMeta>(storeConfig(sessionId));
}

/** True si RAG y índice estructurado corresponden a los mismos archivos. */
export function projectIndexMatches(sessionId: string, filePaths: string[]): boolean {
  if (!hasProjectChunks(sessionId)) return false;
  if (!hasProjectStructuredIndex(sessionId)) return false;
  const meta = loadProjectIndexMeta(sessionId);
  if (!meta?.filePaths?.length) return false;
  const norm = (paths: string[]) =>
    [...paths].map((p) => path.normalize(p).toLowerCase()).sort();
  const a = norm(filePaths);
  const b = norm(meta.filePaths);
  const ragMatch = a.length === b.length && a.every((p, i) => p === b[i]);
  return ragMatch && structuredIndexMatches(sessionId, filePaths);
}

export function hasProjectChunks(sessionId: string): boolean {
  return loadProjectChunks(sessionId).length > 0;
}

/** Borra el índice RAG y estructurado del proyecto (p. ej. al reemplazar archivos de sesión). */
export function clearProjectIndex(sessionId: string): void {
  saveProjectChunks(sessionId, [], {
    indexedAt: new Date().toISOString(),
    filePaths: [],
  });
  clearProjectStructuredIndex(sessionId);
}
