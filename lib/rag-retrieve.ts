import {
  hybridRetrieve,
  hybridRetrieveMulti,
  knowledgeChunkEvaluateScoreAdjust,
  knowledgeChunkQualityAdjustments,
  computeEvaluateMaxPerDoc,
  filterChunksByIncludeDocNames,
  type RetrievedChunk,
} from "@/lib/hybrid-search";
import { loadActiveChunks } from "@/lib/knowledge-config";

export type { RetrievedChunk };

export type RetrieveOptions = {
  topK?: number;
  maxRetrievedChars?: number;
  /** IDs de chunks ya usados (evaluación multi-dimensión). */
  excludeIds?: Set<string>;
  /** Solo estos documentos Knowledge (evaluación). */
  includeDocNames?: string[];
  /** Cupo por documento; si omitido en evaluateMode se calcula automáticamente. */
  maxPerDoc?: number;
  /** Priorizar chunks de esta página del PDF. */
  pageNumber?: number;
  /** Peso de similitud vectorial vs keywords (0–1). */
  hybridVectorWeight?: number;
  /** Modo evaluate: sin boosts Oslo y con diversidad por doc. */
  evaluateMode?: boolean;
};

const DEFAULT_TOP_K = 25;
const DEFAULT_MAX_CHARS = 18_000;

function resolveRetrieveTuning(chunks: { docName: string }[], options: RetrieveOptions) {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const maxChars = options.maxRetrievedChars ?? DEFAULT_MAX_CHARS;
  const docCount = new Set(chunks.map((c) => c.docName)).size;
  const maxPerDoc =
    options.maxPerDoc ??
    (options.evaluateMode ? computeEvaluateMaxPerDoc(topK, docCount) : undefined);
  const scoreAdjust = options.evaluateMode
    ? knowledgeChunkEvaluateScoreAdjust
    : (chunk: { text: string }) => knowledgeChunkQualityAdjustments(chunk.text);
  return { topK, maxChars, maxPerDoc, scoreAdjust };
}

/**
 * Retrieve relevant knowledge chunks (hybrid: embeddings + keywords).
 */
export async function retrieveRelevantChunks(
  evaluationTypeId: number,
  queryText: string,
  options: RetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  let chunks = await loadActiveChunks(evaluationTypeId);
  chunks = filterChunksByIncludeDocNames(chunks, options.includeDocNames);
  if (options.excludeIds) {
    chunks = chunks.filter((c) => !options.excludeIds!.has(c.id));
  }
  if (chunks.length === 0) return [];

  const { topK, maxChars, maxPerDoc, scoreAdjust } = resolveRetrieveTuning(chunks, options);

  return hybridRetrieve(chunks, queryText, {
    topK,
    maxRetrievedChars: maxChars,
    hybridVectorWeight: options.hybridVectorWeight ?? 0.72,
    pageNumber: options.pageNumber,
    maxPerDoc,
    scoreAdjust,
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

  let chunks = await loadActiveChunks(evaluationTypeId);
  chunks = filterChunksByIncludeDocNames(chunks, options.includeDocNames);
  if (options.excludeIds) {
    chunks = chunks.filter((c) => !options.excludeIds!.has(c.id));
  }
  if (chunks.length === 0) return [];

  const { topK, maxChars, maxPerDoc, scoreAdjust } = resolveRetrieveTuning(chunks, options);

  return hybridRetrieveMulti(chunks, queries, {
    topK,
    maxRetrievedChars: maxChars,
    hybridVectorWeight: options.hybridVectorWeight ?? 0.72,
    pageNumber: options.pageNumber,
    maxPerDoc,
    scoreAdjust,
  });
}
