import type { KnowledgeIndexMeta, StoredChunk } from "@/lib/chunk-types";

const TTL_MS = 30 * 60 * 1000;

type ChunksCacheEntry = {
  chunks: StoredChunk[];
  loadedAt: number;
};

type MetaCacheEntry = {
  meta: KnowledgeIndexMeta | null;
  loadedAt: number;
};

const chunksCache = new Map<string, ChunksCacheEntry>();
const metaCache = new Map<string, MetaCacheEntry>();

export function metaCacheKey(chunksKey: string): string {
  return `${chunksKey}:meta`;
}

export async function getCachedChunksAsync(
  key: string,
  loader: () => Promise<StoredChunk[]>
): Promise<StoredChunk[]> {
  const hit = chunksCache.get(key);
  if (hit && Date.now() - hit.loadedAt < TTL_MS) return hit.chunks;
  const chunks = await loader();
  chunksCache.set(key, { chunks, loadedAt: Date.now() });
  return chunks;
}

export async function getCachedMetaAsync(
  key: string,
  loader: () => Promise<KnowledgeIndexMeta | null>
): Promise<KnowledgeIndexMeta | null> {
  const metaKey = metaCacheKey(key);
  const hit = metaCache.get(metaKey);
  if (hit && Date.now() - hit.loadedAt < TTL_MS) return hit.meta;
  const meta = await loader();
  metaCache.set(metaKey, { meta, loadedAt: Date.now() });
  return meta;
}

/** Invalida chunks y meta asociados a la misma clave knowledge:/project:. */
export function invalidateAsyncChunkCache(key: string): void {
  chunksCache.delete(key);
  metaCache.delete(metaCacheKey(key));
}

/** Solo para tests. */
export function clearAsyncChunkCache(): void {
  chunksCache.clear();
  metaCache.clear();
}
