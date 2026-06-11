import { getKnowledgePageSegments } from "@/lib/knowledge-loader";
import { chunkText } from "@/lib/chunking";
import { embedTexts } from "@/lib/embeddings";
import { saveChunks, type StoredChunk } from "@/lib/vector-store";
import { detectPrintedPageInText } from "@/lib/page-lookup";

const CHUNK_SIZE = 1000;
const OVERLAP = 150;

export type IndexKnowledgeResult = { chunkCount: number };

/**
 * Index all knowledge documents: extract text (con páginas en PDF), chunk, embed, store.
 */
export async function indexKnowledge(evaluationTypeId: number): Promise<IndexKnowledgeResult> {
  const segments = await getKnowledgePageSegments(evaluationTypeId);
  if (segments.length === 0) {
    saveChunks(evaluationTypeId, [], {
      indexedAt: new Date().toISOString(),
      knowledgeVersion: "empty",
    });
    return { chunkCount: 0 };
  }

  const allChunks: ReturnType<typeof chunkText> = [];
  for (const { docName, text, page } of segments) {
    const chunks = chunkText(text, docName, {
      chunkSizeChars: CHUNK_SIZE,
      overlapChars: OVERLAP,
      page,
    });
    allChunks.push(...chunks);
  }

  if (allChunks.length === 0) {
    saveChunks(evaluationTypeId, [], {
      indexedAt: new Date().toISOString(),
      knowledgeVersion: JSON.stringify(segments.map((s) => s.docName)),
    });
    return { chunkCount: 0 };
  }

  const texts = allChunks.map((c) => c.text);
  const embeddings = await embedTexts(texts);

  const stored: StoredChunk[] = allChunks.map((chunk, i) => {
    const printedPage = detectPrintedPageInText(chunk.text, chunk.page);
    return {
      id: `${chunk.docName}-${chunk.page ?? "n"}-${chunk.index}`,
      docName: chunk.docName,
      text: chunk.text,
      embedding: embeddings[i] ?? [],
      ...(chunk.page != null ? { page: chunk.page } : {}),
      ...(printedPage != null ? { printedPage } : {}),
    };
  });

  saveChunks(evaluationTypeId, stored, {
    indexedAt: new Date().toISOString(),
    knowledgeVersion: JSON.stringify([...new Set(segments.map((s) => s.docName))]),
  });
  return { chunkCount: stored.length };
}
