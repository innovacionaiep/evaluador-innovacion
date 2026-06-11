import path from "path";
import fs from "fs";
import { getVectorsDir } from "@/lib/storage";
import { loadChunks } from "@/lib/vector-store";

const META_FILE = "meta.json";
const CHUNKS_FILE = "chunks.json";

export type RagStatus = {
  hasIndex: boolean;
  chunkCount: number;
  indexedAt: string | null;
  knowledgeVersion: string | null;
  chunksFileBytes: number;
};

export function getRagStatus(evaluationTypeId: number): RagStatus {
  const dir = getVectorsDir(evaluationTypeId);
  const chunksPath = path.join(dir, CHUNKS_FILE);
  const metaPath = path.join(dir, META_FILE);
  const chunks = loadChunks(evaluationTypeId);

  let indexedAt: string | null = null;
  let knowledgeVersion: string | null = null;
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
        indexedAt?: string;
        knowledgeVersion?: string;
      };
      indexedAt = meta.indexedAt ?? null;
      knowledgeVersion = meta.knowledgeVersion ?? null;
    } catch {
      /* ignore */
    }
  }

  let chunksFileBytes = 0;
  try {
    if (fs.existsSync(chunksPath)) {
      chunksFileBytes = fs.statSync(chunksPath).size;
    }
  } catch {
    /* ignore */
  }

  return {
    hasIndex: chunks.length > 0,
    chunkCount: chunks.length,
    indexedAt,
    knowledgeVersion,
    chunksFileBytes,
  };
}
