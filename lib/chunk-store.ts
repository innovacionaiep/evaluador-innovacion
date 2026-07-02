import path from "path";
import fs from "fs";
import {
  chunkCacheKey,
  getCachedChunks,
  invalidateChunkCache,
} from "@/lib/chunk-cache";
import type { StoredChunk } from "@/lib/vector-store";

export type ChunkStoreConfig = {
  kind: "knowledge" | "project";
  id: string | number;
  dir: string;
  chunksFile: string;
  metaFile?: string;
};

function readChunksFromDisk(chunksPath: string): StoredChunk[] {
  if (!fs.existsSync(chunksPath)) return [];
  try {
    const raw = fs.readFileSync(chunksPath, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function loadChunksFromStore(config: ChunkStoreConfig): StoredChunk[] {
  const key = chunkCacheKey(config.kind, config.id);
  const chunksPath = path.join(config.dir, config.chunksFile);
  return getCachedChunks(key, () => readChunksFromDisk(chunksPath));
}

export function saveChunksToStore(
  config: ChunkStoreConfig,
  chunks: StoredChunk[],
  meta?: Record<string, unknown>
): void {
  const chunksPath = path.join(config.dir, config.chunksFile);
  fs.writeFileSync(chunksPath, JSON.stringify(chunks), "utf-8");
  if (meta && config.metaFile) {
    fs.writeFileSync(path.join(config.dir, config.metaFile), JSON.stringify(meta), "utf-8");
  }
  invalidateChunkCache(chunkCacheKey(config.kind, config.id));
}

export function loadMetaFromStore<T>(config: ChunkStoreConfig): T | null {
  if (!config.metaFile) return null;
  const metaPath = path.join(config.dir, config.metaFile);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as T;
  } catch {
    return null;
  }
}
