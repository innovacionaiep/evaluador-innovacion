import path from "path";
import fs from "fs";
import { getVectorsDir } from "@/lib/storage";
import { loadChunksAsync, loadChunksMetaAsync } from "@/lib/vector-store";
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
  const chunks = knowledgeConfigured ? await loadChunksAsync(evaluationTypeId) : [];

  let indexedAt: string | null = null;
  let knowledgeVersion: string | null = null;
  const meta = knowledgeConfigured ? await loadChunksMetaAsync(evaluationTypeId) : null;
  if (meta) {
    indexedAt = meta.indexedAt ?? null;
    knowledgeVersion = meta.knowledgeVersion ?? null;
  } else if (fs.existsSync(metaPath)) {
    try {
      const diskMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
        indexedAt?: string;
        knowledgeVersion?: string;
      };
      indexedAt = diskMeta.indexedAt ?? null;
      knowledgeVersion = diskMeta.knowledgeVersion ?? null;
    } catch {
      /* ignore */
    }
  }

  let chunksFileBytes = 0;
  try {
    if (fs.existsSync(chunksPath)) {
      chunksFileBytes = fs.statSync(chunksPath).size;
    } else if (chunks.length > 0) {
      chunksFileBytes = JSON.stringify(chunks).length;
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
