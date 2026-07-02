import {
  hybridRetrieve,
  hybridRetrieveMulti,
  knowledgeChunkQualityAdjustments,
  type RetrievedChunk,
} from "@/lib/hybrid-search";
import { loadActiveChunks } from "@/lib/knowledge-config";

export type { RetrievedChunk };

export type RetrieveOptions = {
  topK?: number;
  maxRetrievedChars?: number;
  /** IDs de chunks ya usados (evaluación multi-dimensión). */
  excludeIds?: Set<string>;
  /** Priorizar chunks de esta página del PDF. */
  pageNumber?: number;
  /** Peso de similitud vectorial vs keywords (0–1). */
  hybridVectorWeight?: number;
};

const DEFAULT_TOP_K = 25;
const DEFAULT_MAX_CHARS = 18_000;

const knowledgeScoreAdjust = (chunk: { text: string }) =>
  knowledgeChunkQualityAdjustments(chunk.text);

/**
 * Retrieve relevant knowledge chunks (hybrid: embeddings + keywords).
 */
export async function retrieveRelevantChunks(
  evaluationTypeId: number,
  queryText: string,
  options: RetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const maxChars = options.maxRetrievedChars ?? DEFAULT_MAX_CHARS;

  const chunks = (await loadActiveChunks(evaluationTypeId)).filter(
    (c) => !options.excludeIds?.has(c.id)
  );
  if (chunks.length === 0) return [];

  return hybridRetrieve(chunks, queryText, {
    topK,
    maxRetrievedChars: maxChars,
    hybridVectorWeight: options.hybridVectorWeight ?? 0.72,
    pageNumber: options.pageNumber,
    scoreAdjust: knowledgeScoreAdjust,
  });
}

/**
 * Varias búsquedas (sub-consultas) con deduplicación; mejora preguntas amplias del manual.
 */
export async function retrieveRelevantChunksMulti(
  evaluationTypeId: number,
  queryTexts: string[],
  options: RetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  const queries = [...new Set(queryTexts.map((q) => q.trim()).filter(Boolean))];
  if (queries.length === 0) return [];
  if (queries.length === 1) {
    return retrieveRelevantChunks(evaluationTypeId, queries[0], options);
  }

  const topK = options.topK ?? DEFAULT_TOP_K;
  const maxChars = options.maxRetrievedChars ?? DEFAULT_MAX_CHARS;

  const chunks = (await loadActiveChunks(evaluationTypeId)).filter(
    (c) => !options.excludeIds?.has(c.id)
  );
  if (chunks.length === 0) return [];

  return hybridRetrieveMulti(chunks, queries, {
    topK,
    maxRetrievedChars: maxChars,
    hybridVectorWeight: options.hybridVectorWeight ?? 0.72,
    pageNumber: options.pageNumber,
    scoreAdjust: knowledgeScoreAdjust,
  });
}
