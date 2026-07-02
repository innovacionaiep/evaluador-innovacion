import type { StoredChunk } from "@/lib/vector-store";

const cache = new Map<string, StoredChunk[]>();

export function getCachedChunks(key: string, loader: () => StoredChunk[]): StoredChunk[] {
  const hit = cache.get(key);
  if (hit) return hit;
  const chunks = loader();
  cache.set(key, chunks);
  return chunks;
}

export function invalidateChunkCache(key: string): void {
  cache.delete(key);
}

export function chunkCacheKey(kind: "knowledge" | "project", id: string | number): string {
  return `${kind}:${id}`;
}
