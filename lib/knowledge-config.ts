import { getConfig } from "@/lib/db";
import { loadChunks, saveChunks, type StoredChunk } from "@/lib/vector-store";

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
  return loadChunks(evaluationTypeId);
}

export async function hasActiveKnowledgeIndex(evaluationTypeId: number): Promise<boolean> {
  const chunks = await loadActiveChunks(evaluationTypeId);
  return chunks.length > 0;
}

/** Borra índice en disco si ya no hay knowledge_paths (índice huérfano). */
export async function clearOrphanKnowledgeIndex(evaluationTypeId: number): Promise<boolean> {
  if (await isKnowledgeConfigured(evaluationTypeId)) return false;
  const onDisk = loadChunks(evaluationTypeId);
  if (onDisk.length === 0) return false;
  saveChunks(evaluationTypeId, [], {
    indexedAt: new Date().toISOString(),
    knowledgeVersion: "empty",
  });
  return true;
}
