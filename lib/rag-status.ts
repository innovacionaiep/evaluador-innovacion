import path from "path";
import fs from "fs";
import { getVectorsDir } from "@/lib/storage";
import { loadChunks } from "@/lib/vector-store";
import {
  clearOrphanKnowledgeIndex,
  isKnowledgeConfigured,
} from "@/lib/knowledge-config";

const META_FILE = "meta.json";
const CHUNKS_FILE = "chunks.json";

export type RagStatus = {
  hasIndex: boolean;
  chunkCount: number;
  indexedAt: string | null;
  knowledgeVersion: string | null;
  chunksFileBytes: number;
  knowledgeConfigured: boolean;
};

export async function getRagStatus(evaluationTypeId: number): Promise<RagStatus> {
  const dir = getVectorsDir(evaluationTypeId);
  const chunksPath = path.join(dir, CHUNKS_FILE);
  const metaPath = path.join(dir, META_FILE);
  const knowledgeConfigured = await isKnowledgeConfigured(evaluationTypeId);
  if (!knowledgeConfigured) {
    await clearOrphanKnowledgeIndex(evaluationTypeId);
  }
  const chunks = knowledgeConfigured ? loadChunks(evaluationTypeId) : [];

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
    hasIndex: knowledgeConfigured && chunks.length > 0,
    chunkCount: knowledgeConfigured ? chunks.length : 0,
    indexedAt: knowledgeConfigured ? indexedAt : null,
    knowledgeVersion: knowledgeConfigured ? knowledgeVersion : null,
    chunksFileBytes: knowledgeConfigured ? chunksFileBytes : 0,
    knowledgeConfigured,
  };
}
