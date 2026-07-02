import path from "path";
import { getVectorsDir } from "@/lib/storage";
import {
  loadChunksFromStore,
  loadMetaFromStore,
  saveChunksToStore,
  type ChunkStoreConfig,
} from "@/lib/chunk-store";

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

export type KnowledgeIndexMeta = {
  indexedAt: string;
  knowledgeVersion?: string;
};

function storeConfig(evaluationTypeId: number): ChunkStoreConfig {
  return {
    kind: "knowledge",
    id: evaluationTypeId,
    dir: getVectorsDir(evaluationTypeId),
    chunksFile: CHUNKS_FILE,
    metaFile: META_FILE,
  };
}

export function saveChunks(
  evaluationTypeId: number,
  chunks: StoredChunk[],
  meta?: KnowledgeIndexMeta
): void {
  saveChunksToStore(storeConfig(evaluationTypeId), chunks, meta);
}

export function loadChunks(evaluationTypeId: number): StoredChunk[] {
  return loadChunksFromStore(storeConfig(evaluationTypeId));
}

export function loadChunksMeta(evaluationTypeId: number): KnowledgeIndexMeta | null {
  return loadMetaFromStore<KnowledgeIndexMeta>(storeConfig(evaluationTypeId));
}

export function hasChunks(evaluationTypeId: number): boolean {
  return loadChunks(evaluationTypeId).length > 0;
}
