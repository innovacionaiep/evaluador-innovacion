import { getConfig } from "@/lib/db";
import { clearKnowledgeVectorsBlob } from "@/lib/blob-chunk-store";
import { loadChunksAsync, saveChunks, type StoredChunk } from "@/lib/vector-store";
import { useBlobStorage } from "@/lib/blob-storage";

export type KnowledgePathItem = string | { name: string; url: string };

export function parseKnowledgePaths(raw: string | null | undefined): KnowledgePathItem[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getKnowledgePaths(evaluationTypeId: number): Promise<KnowledgePathItem[]> {
  const config = await getConfig(evaluationTypeId);
  return parseKnowledgePaths(config?.knowledge_paths);
}

export async function isKnowledgeConfigured(evaluationTypeId: number): Promise<boolean> {
  const paths = await getKnowledgePaths(evaluationTypeId);
  return paths.length > 0;
}

/**
 * Chunks del índice RAG solo si el tipo de evaluación tiene knowledge_paths configurados.
 * Evita usar un índice huérfano de otro documento o de una configuración anterior.
 */
export async function loadActiveChunks(evaluationTypeId: number): Promise<StoredChunk[]> {
  if (!(await isKnowledgeConfigured(evaluationTypeId))) return [];
  return loadChunksAsync(evaluationTypeId);
}

export async function hasActiveKnowledgeIndex(evaluationTypeId: number): Promise<boolean> {
  const chunks = await loadActiveChunks(evaluationTypeId);
  return chunks.length > 0;
}

/** Borra índice en disco/blob si ya no hay knowledge_paths (índice huérfano). */
export async function clearOrphanKnowledgeIndex(evaluationTypeId: number): Promise<boolean> {
  if (await isKnowledgeConfigured(evaluationTypeId)) return false;
  const existing = await loadChunksAsync(evaluationTypeId);
  if (existing.length === 0) return false;
  await saveChunks(evaluationTypeId, [], {
    indexedAt: new Date().toISOString(),
    knowledgeVersion: "empty",
  });
  if (useBlobStorage()) {
    await clearKnowledgeVectorsBlob(evaluationTypeId);
  }
  return true;
}
