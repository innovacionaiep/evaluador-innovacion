import { embedQuery } from "@/lib/embeddings";
import { loadActiveChunks } from "@/lib/knowledge-config";
import type { StoredChunk } from "@/lib/vector-store";

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

/** Penaliza fragmentos del índice (.... 32) y prioriza cuerpo metodológico. */
function chunkQualityAdjustments(text: string): number {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return -0.2;

  const tocLines = lines.filter((l) => /\.{4,}\s*\d{1,4}\s*$/.test(l.trim()));
  const tocRatio = tocLines.length / lines.length;
  let adj = 0;

  if (tocRatio >= 0.35) adj -= 0.3;
  else if (tocRatio >= 0.15) adj -= 0.12;

  if (text.length < 150 && tocLines.length > 0) adj -= 0.15;
  if (text.length > 220 && /\b\d+\.\d{1,2}\.\s+[A-Za-z]/.test(text)) adj += 0.06;
  if (/innovation survey|questionnaire|respondent|sample design|\bCIS\b|data collection/i.test(text)) {
    adj += 0.1;
  }
  if (/collecting, analysing and reporting|measuring business innovation/i.test(text)) adj += 0.05;

  return adj;
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

  const chunks = (await loadActiveChunks(evaluationTypeId)).filter(
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
    let score = vectorWeight * vec + keywordWeight * kw + chunkQualityAdjustments(chunk.text);
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
  const perQueryK = Math.min(topK, Math.ceil(topK / queries.length) + 18);
  const perQueryChars = Math.ceil(maxChars / queries.length) + 10_000;

  const byId = new Map<string, RetrievedChunk>();
  for (const q of queries) {
    const batch = await retrieveRelevantChunks(evaluationTypeId, q, {
      ...options,
      topK: perQueryK,
      maxRetrievedChars: perQueryChars,
    });
    for (const c of batch) {
      const prev = byId.get(c.id);
      if (!prev || c.score > prev.score) {
        byId.set(c.id, c);
      }
    }
  }

  const merged = [...byId.values()].sort((a, b) => b.score - a.score);
  const selected: RetrievedChunk[] = [];
  let totalChars = 0;
  for (const r of merged) {
    if (selected.length >= topK) break;
    if (totalChars + r.text.length > maxChars && selected.length > 0) break;
    selected.push(r);
    totalChars += r.text.length;
  }
  return selected;
}
