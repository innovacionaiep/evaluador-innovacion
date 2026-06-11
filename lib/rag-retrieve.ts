import { embedQuery } from "@/lib/embeddings";
import { loadChunks, type StoredChunk } from "@/lib/vector-store";

export type RetrievedChunk = StoredChunk & { score: number };

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
const HYBRID_CANDIDATE_MULTIPLIER = 2.5;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
}

function keywordScore(query: string, chunkText: string): number {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return 0;
  const cTokens = tokenize(chunkText);
  if (cTokens.length === 0) return 0;
  let hits = 0;
  for (const t of cTokens) {
    if (qTokens.has(t)) hits += 1;
  }
  return hits / Math.sqrt(cTokens.length * qTokens.size);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

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
  const vectorWeight = options.hybridVectorWeight ?? 0.72;
  const keywordWeight = 1 - vectorWeight;
  const pageNumber = options.pageNumber;

  const chunks = loadChunks(evaluationTypeId).filter(
    (c) => !options.excludeIds?.has(c.id)
  );
  if (chunks.length === 0) return [];

  const queryEmbedding = await embedQuery(queryText);
  const candidateCount = Math.min(
    chunks.length,
    Math.ceil(topK * HYBRID_CANDIDATE_MULTIPLIER)
  );

  const scored = chunks.map((chunk) => {
    const vec = cosineSimilarity(chunk.embedding, queryEmbedding);
    const kw = keywordScore(queryText, chunk.text);
    let score = vectorWeight * vec + keywordWeight * kw;
    if (pageNumber != null && chunk.page === pageNumber) {
      score += 0.35;
    } else if (pageNumber != null && chunk.text.includes(`página ${pageNumber}`)) {
      score += 0.15;
    }
    return { ...chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, candidateCount);

  const selected: RetrievedChunk[] = [];
  let totalChars = 0;
  for (const r of candidates) {
    if (selected.length >= topK) break;
    if (totalChars + r.text.length > maxChars && selected.length > 0) break;
    selected.push(r);
    totalChars += r.text.length;
  }
  return selected;
}
