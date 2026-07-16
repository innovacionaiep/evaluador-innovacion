import type { RetrievedChunk, StoredChunk } from "@/lib/chunk-types";
import { embedQuery, embedTexts } from "@/lib/embeddings";
import {
  filterChunksByIncludeDocNames,
  mergeRetrievedChunks,
  scoreChunks,
  type HybridRetrieveOptions,
} from "@/lib/hybrid-search-core";

export type { RetrievedChunk } from "@/lib/chunk-types";
export {
  cosineSimilarity,
  keywordScore,
  knowledgeChunkQualityAdjustments,
  knowledgeChunkEvaluateScoreAdjust,
  knowledgeChunkTocAdjustments,
  computeEvaluateMaxPerDoc,
  filterChunksByIncludeDocNames,
  normalizeIncludeDocNames,
  formatDocMixSummary,
  scoreChunks,
  mergeRetrievedChunks,
  selectChunksWithLimits,
  type HybridRetrieveOptions,
} from "@/lib/hybrid-search-core";

function filterPool(
  chunks: StoredChunk[],
  options: HybridRetrieveOptions
): StoredChunk[] {
  let filtered = filterChunksByIncludeDocNames(chunks, options.includeDocNames);
  if (options.excludeIds) {
    filtered = filtered.filter((c) => !options.excludeIds!.has(c.id));
  }
  return filtered;
}

/**
 * Búsqueda híbrida (embeddings + keywords) sobre un conjunto de chunks en memoria.
 */
export async function hybridRetrieve(
  chunks: StoredChunk[],
  queryText: string,
  options: HybridRetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  const filtered = filterPool(chunks, options);
  if (filtered.length === 0 || !queryText.trim()) return [];
  const queryEmbedding = await embedQuery(queryText);
  return scoreChunks(filtered, queryText, queryEmbedding, options);
}

/**
 * Varias consultas con un solo batch de embeddings (reduce llamadas API).
 */
export async function hybridRetrieveMulti(
  chunks: StoredChunk[],
  queryTexts: string[],
  options: HybridRetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  const queries = [...new Set(queryTexts.map((q) => q.trim()).filter(Boolean))];
  if (queries.length === 0) return [];
  if (queries.length === 1) {
    return hybridRetrieve(chunks, queries[0], options);
  }

  const filtered = filterPool(chunks, options);
  if (filtered.length === 0) return [];

  const topK = options.topK ?? 12;
  const maxChars = options.maxRetrievedChars ?? 12_000;
  const embeddings = await embedTexts(queries);
  const batches: RetrievedChunk[] = [];

  for (let i = 0; i < queries.length; i++) {
    const queryText = queries[i];
    const queryEmbedding = embeddings[i] ?? [];
    const batch = scoreChunks(filtered, queryText, queryEmbedding, {
      ...options,
      topK: Math.ceil(topK / queries.length) + 8,
      maxRetrievedChars: Math.ceil(maxChars / queries.length) + 4000,
    });
    batches.push(...batch);
  }

  return mergeRetrievedChunks(batches, topK, maxChars, options.maxPerDoc);
}
