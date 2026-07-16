import type { RetrievedChunk, StoredChunk } from "@/lib/chunk-types";

export type HybridRetrieveOptions = {
  topK?: number;
  maxRetrievedChars?: number;
  hybridVectorWeight?: number;
  scoreAdjust?: (chunk: StoredChunk) => number;
  pageNumber?: number;
  excludeIds?: Set<string>;
  /** Solo chunks de estos docName (evaluación). Vacío/omitido = todos. */
  includeDocNames?: string[];
  /** Tope de fragmentos por documento (diversidad). */
  maxPerDoc?: number;
};

const HYBRID_CANDIDATE_MULTIPLIER = 2.5;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
}

export function keywordScore(query: string, chunkText: string): number {
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

export function cosineSimilarity(a: number[], b: number[]): number {
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

/** Normaliza allowlist: undefined = todos; lista no vacía = filtro. */
export function normalizeIncludeDocNames(raw?: string[] | null): string[] | undefined {
  if (!raw || !Array.isArray(raw)) return undefined;
  const unique = [...new Set(raw.map((s) => String(s).trim()).filter(Boolean))];
  return unique.length > 0 ? unique : undefined;
}

export function filterChunksByIncludeDocNames<T extends { docName: string }>(
  chunks: T[],
  includeDocNames?: string[] | null
): T[] {
  const names = normalizeIncludeDocNames(includeDocNames);
  if (!names) return chunks;
  const set = new Set(names);
  return chunks.filter((c) => set.has(c.docName));
}

/** Cupo por doc en evaluate cuando hay ≥2 documentos en el pool. */
export function computeEvaluateMaxPerDoc(topK: number, docCount: number): number | undefined {
  if (docCount < 2 || topK <= 0) return undefined;
  return Math.max(2, Math.ceil(topK / docCount));
}

/** Penaliza fragmentos de índice/TOC (genérico). */
export function knowledgeChunkTocAdjustments(text: string): number {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return -0.2;

  const tocLines = lines.filter((l) => /\.{4,}\s*\d{1,4}\s*$/.test(l.trim()));
  const tocRatio = tocLines.length / lines.length;
  let adj = 0;

  if (tocRatio >= 0.35) adj -= 0.3;
  else if (tocRatio >= 0.15) adj -= 0.12;

  if (text.length < 150 && tocLines.length > 0) adj -= 0.15;
  return adj;
}

/** Boosts orientados a Manual Oslo / encuesta EN (solo chat u opciones explícitas). */
export function knowledgeChunkOsloBoostAdjustments(text: string): number {
  let adj = 0;
  if (text.length > 220 && /\b\d+\.\d{1,2}\.\s+[A-Za-z]/.test(text)) adj += 0.06;
  if (/innovation survey|questionnaire|respondent|sample design|\bCIS\b|data collection/i.test(text)) {
    adj += 0.1;
  }
  if (/collecting, analysing and reporting|measuring business innovation/i.test(text)) adj += 0.05;
  return adj;
}

/**
 * Ajustes de calidad Knowledge.
 * Por defecto incluye boosts Oslo (compat chat). En evaluate usar includeOsloBoosts: false.
 */
export function knowledgeChunkQualityAdjustments(
  text: string,
  options?: { includeOsloBoosts?: boolean }
): number {
  const includeOslo = options?.includeOsloBoosts !== false;
  return (
    knowledgeChunkTocAdjustments(text) +
    (includeOslo ? knowledgeChunkOsloBoostAdjustments(text) : 0)
  );
}

const knowledgeScoreAdjust = (chunk: StoredChunk) =>
  knowledgeChunkQualityAdjustments(chunk.text);

/** Score adjust para evaluación: solo TOC, sin boosts Oslo/EN. */
export function knowledgeChunkEvaluateScoreAdjust(chunk: StoredChunk): number {
  return knowledgeChunkTocAdjustments(chunk.text);
}

/** Selección final con topK, presupuesto de chars y cupo opcional por doc. */
export function selectChunksWithLimits(
  ranked: RetrievedChunk[],
  topK: number,
  maxChars: number,
  maxPerDoc?: number
): RetrievedChunk[] {
  const selected: RetrievedChunk[] = [];
  let totalChars = 0;
  const perDoc = new Map<string, number>();

  for (const r of ranked) {
    if (selected.length >= topK) break;
    if (totalChars + r.text.length > maxChars && selected.length > 0) break;
    if (maxPerDoc != null && maxPerDoc > 0) {
      const n = perDoc.get(r.docName) ?? 0;
      if (n >= maxPerDoc) continue;
      perDoc.set(r.docName, n + 1);
    }
    selected.push(r);
    totalChars += r.text.length;
  }
  return selected;
}

export function scoreChunks(
  chunks: StoredChunk[],
  queryText: string,
  queryEmbedding: number[],
  options: HybridRetrieveOptions = {}
): RetrievedChunk[] {
  const topK = options.topK ?? 12;
  const maxChars = options.maxRetrievedChars ?? 12_000;
  const vectorWeight = options.hybridVectorWeight ?? 0.72;
  const keywordWeight = 1 - vectorWeight;
  const pageNumber = options.pageNumber;
  const scoreAdjust = options.scoreAdjust ?? knowledgeScoreAdjust;
  const maxPerDoc = options.maxPerDoc;

  const candidateCount = Math.min(chunks.length, Math.ceil(topK * HYBRID_CANDIDATE_MULTIPLIER));

  const scored = chunks.map((chunk) => {
    const vec = cosineSimilarity(chunk.embedding, queryEmbedding);
    const kw = keywordScore(queryText, chunk.text);
    let score = vectorWeight * vec + keywordWeight * kw + scoreAdjust(chunk);
    if (pageNumber != null && chunk.page === pageNumber) {
      score += 0.35;
    } else if (pageNumber != null && chunk.text.includes(`página ${pageNumber}`)) {
      score += 0.15;
    }
    return { ...chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, candidateCount);
  return selectChunksWithLimits(candidates, topK, maxChars, maxPerDoc);
}

export function mergeRetrievedChunks(
  batches: RetrievedChunk[],
  topK: number,
  maxChars: number,
  maxPerDoc?: number
): RetrievedChunk[] {
  const byId = new Map<string, RetrievedChunk>();
  for (const c of batches) {
    const prev = byId.get(c.id);
    if (!prev || c.score > prev.score) byId.set(c.id, c);
  }
  const merged = [...byId.values()].sort((a, b) => b.score - a.score);
  return selectChunksWithLimits(merged, topK, maxChars, maxPerDoc);
}

/** Resumen corto de mezcla de documentos para telemetría. */
export function formatDocMixSummary(
  chunks: Array<{ docName: string }>
): string {
  const counts = new Map<string, number>();
  for (const c of chunks) {
    counts.set(c.docName, (counts.get(c.docName) ?? 0) + 1);
  }
  if (counts.size === 0) return "0 docs";
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => `${name}×${n}`);
  return `${counts.size} doc(s): ${parts.join(", ")}`;
}
