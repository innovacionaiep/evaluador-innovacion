import { indexProjectFiles } from "@/lib/project-rag-index";
import {
  buildProjectStructuredIndex,
  saveProjectStructuredIndex,
} from "@/lib/project-structured-index";

export type IngestProjectResult = {
  chunkCount: number;
  structuredFileCount: number;
};

/**
 * Ingesta completa del proyecto al subir: parsing técnico estructurado + índice RAG.
 */
export async function ingestProjectFiles(
  sessionId: string,
  filePaths: string[]
): Promise<IngestProjectResult> {
  const structured = await buildProjectStructuredIndex(filePaths);
  saveProjectStructuredIndex(sessionId, structured);
  const { chunkCount } = await indexProjectFiles(sessionId, filePaths);
  return { chunkCount, structuredFileCount: structured.files.length };
}
