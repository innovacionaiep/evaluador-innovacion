export type TextChunk = { text: string; docName: string; index: number; page?: number };

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 150;

/**
 * Tope duro de caracteres por fragmento enviado a embeddings.
 * Algunos proveedores cuentan ~1+ tokens/carácter en PDFs ruidosos; 6000 chars
 * aún podía superar 8192 tokens. Margen amplio bajo el techo del modelo.
 */
export const EMBEDDING_MAX_INPUT_CHARS = 3500;

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parte un texto en trozos de como máximo `maxLen` caracteres (con solape). */
export function hardSplitText(text: string, maxLen: number, overlap: number): string[] {
  const t = text.trim();
  if (!t) return [];
  if (maxLen <= 0) return [t];
  if (t.length <= maxLen) return [t];

  const safeOverlap = Math.max(0, Math.min(overlap, maxLen - 1));
  const parts: string[] = [];
  let start = 0;
  while (start < t.length) {
    const end = Math.min(t.length, start + maxLen);
    const slice = t.slice(start, end).trim();
    if (slice) parts.push(slice);
    if (end >= t.length) break;
    start = Math.max(start + 1, end - safeOverlap);
  }
  return parts;
}

function pushChunk(
  result: TextChunk[],
  text: string,
  docName: string,
  page: number | undefined,
  chunkIndex: { value: number },
  maxLen: number,
  overlap: number
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (trimmed.length <= maxLen) {
    result.push({ text: trimmed, docName, index: chunkIndex.value++, page });
    return;
  }
  for (const part of hardSplitText(trimmed, maxLen, overlap)) {
    result.push({ text: part, docName, index: chunkIndex.value++, page });
  }
}

/**
 * Chunk text by size with overlap. Prefers paragraph boundaries, then sentence boundaries.
 * Nunca emite un fragmento más largo que `chunkSizeChars` (hard-split si hace falta).
 */
export function chunkText(
  text: string,
  docName: string,
  options: { chunkSizeChars?: number; overlapChars?: number; page?: number } = {}
): TextChunk[] {
  const page = options.page;
  const requestedSize = options.chunkSizeChars ?? DEFAULT_CHUNK_SIZE;
  const chunkSize = Math.min(Math.max(1, requestedSize), EMBEDDING_MAX_INPUT_CHARS);
  const overlap = Math.min(options.overlapChars ?? DEFAULT_OVERLAP, Math.max(0, chunkSize - 1));
  if (!text || chunkSize <= 0) return [];

  const result: TextChunk[] = [];
  const paragraphs = splitIntoParagraphs(text);
  let buffer = "";
  const chunkIndex = { value: 0 };

  for (const para of paragraphs) {
    if (para.length >= chunkSize) {
      if (buffer) {
        pushChunk(result, buffer, docName, page, chunkIndex, chunkSize, overlap);
        buffer = "";
      }
      const sentences = splitIntoSentences(para);
      let sentenceBuffer = "";
      for (const sent of sentences) {
        if (sent.length >= chunkSize) {
          if (sentenceBuffer) {
            pushChunk(result, sentenceBuffer, docName, page, chunkIndex, chunkSize, overlap);
            sentenceBuffer = "";
          }
          pushChunk(result, sent, docName, page, chunkIndex, chunkSize, overlap);
          continue;
        }
        if (sentenceBuffer.length + sent.length + 1 <= chunkSize) {
          sentenceBuffer += (sentenceBuffer ? " " : "") + sent;
        } else {
          if (sentenceBuffer) {
            pushChunk(result, sentenceBuffer, docName, page, chunkIndex, chunkSize, overlap);
          }
          // Solape + frase nueva: si aún excede, hard-split en pushChunk
          const overlapStart = Math.max(0, sentenceBuffer.length - overlap);
          const overlapText = sentenceBuffer.slice(overlapStart);
          sentenceBuffer = (overlapText ? overlapText + " " : "") + sent;
          if (sentenceBuffer.length > chunkSize) {
            pushChunk(result, sentenceBuffer, docName, page, chunkIndex, chunkSize, overlap);
            sentenceBuffer = "";
          }
        }
      }
      if (sentenceBuffer.trim()) {
        pushChunk(result, sentenceBuffer, docName, page, chunkIndex, chunkSize, overlap);
      }
      continue;
    }

    if (buffer.length + para.length + 2 <= chunkSize) {
      buffer += (buffer ? "\n\n" : "") + para;
    } else {
      if (buffer) {
        pushChunk(result, buffer, docName, page, chunkIndex, chunkSize, overlap);
        const overlapStart = Math.max(0, buffer.length - overlap);
        buffer = buffer.slice(overlapStart) + "\n\n" + para;
        if (buffer.length > chunkSize) {
          pushChunk(result, buffer, docName, page, chunkIndex, chunkSize, overlap);
          buffer = "";
        }
      } else {
        buffer = para;
      }
    }
  }

  if (buffer.trim()) {
    pushChunk(result, buffer, docName, page, chunkIndex, chunkSize, overlap);
  }

  return result;
}
