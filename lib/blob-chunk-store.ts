import "server-only";

import { del, head, put } from "@vercel/blob";
import {
  knowledgeVectorsBlobPath,
  useBlobStorage,
} from "@/lib/blob-storage";
import { publicBlobUrl } from "@/lib/blob-public-url";
import type { KnowledgeIndexMeta, StoredChunk } from "@/lib/vector-store";

const CHUNKS_FILE = "chunks.json";
const META_FILE = "meta.json";

async function resolveBlobUrl(pathname: string): Promise<string | null> {
  const constructed = publicBlobUrl(pathname);
  if (constructed) return constructed;
  try {
    const meta = await head(pathname);
    return meta?.url ?? null;
  } catch {
    return null;
  }
}

async function fetchBlobJson<T>(pathname: string): Promise<T | null> {
  try {
    const url = await resolveBlobUrl(pathname);
    if (!url) return null;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function putBlobJson(pathname: string, data: unknown): Promise<void> {
  const body = JSON.stringify(data);
  await put(pathname, body, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** HEAD sin descargar el cuerpo (solo metadata/size). */
export async function headKnowledgeBlob(pathname: string): Promise<{ size: number } | null> {
  if (!useBlobStorage()) return null;
  try {
    const meta = await head(pathname);
    if (!meta) return null;
    return { size: meta.size };
  } catch {
    return null;
  }
}

/**
 * Metadata/URL de chunks.json vía head() (Simple). Preferir knowledgeChunksPublicUrl
 * cuando solo se necesita el link de descarga.
 */
export async function headKnowledgeChunksBlob(
  evaluationTypeId: number
): Promise<{ size: number; url: string } | null> {
  if (!useBlobStorage()) return null;
  try {
    const pathname = knowledgeVectorsBlobPath(evaluationTypeId, CHUNKS_FILE);
    const meta = await head(pathname);
    if (!meta?.url) return null;
    return { size: meta.size, url: meta.url };
  } catch {
    return null;
  }
}

/** URL pública de chunks.json sin head (null si no se puede construir). */
export function knowledgeChunksPublicUrl(evaluationTypeId: number): string | null {
  return publicBlobUrl(knowledgeVectorsBlobPath(evaluationTypeId, CHUNKS_FILE));
}

export async function loadKnowledgeChunksFromBlob(
  evaluationTypeId: number
): Promise<StoredChunk[] | null> {
  if (!useBlobStorage()) return null;
  const data = await fetchBlobJson<StoredChunk[]>(
    knowledgeVectorsBlobPath(evaluationTypeId, CHUNKS_FILE)
  );
  return Array.isArray(data) ? data : null;
}

export async function loadKnowledgeMetaFromBlob(
  evaluationTypeId: number
): Promise<KnowledgeIndexMeta | null> {
  if (!useBlobStorage()) return null;
  return fetchBlobJson<KnowledgeIndexMeta>(
    knowledgeVectorsBlobPath(evaluationTypeId, META_FILE)
  );
}

export async function saveKnowledgeChunksToBlob(
  evaluationTypeId: number,
  chunks: StoredChunk[],
  meta?: KnowledgeIndexMeta
): Promise<void> {
  if (!useBlobStorage()) return;
  await putBlobJson(knowledgeVectorsBlobPath(evaluationTypeId, CHUNKS_FILE), chunks);
  if (meta) {
    await putBlobJson(knowledgeVectorsBlobPath(evaluationTypeId, META_FILE), meta);
  }
}

/** Elimina chunks.json + meta.json. Usa del() (no factura Advanced) en vez de put vacíos. */
export async function clearKnowledgeVectorsBlob(evaluationTypeId: number): Promise<void> {
  if (!useBlobStorage()) return;
  const paths = [
    knowledgeVectorsBlobPath(evaluationTypeId, CHUNKS_FILE),
    knowledgeVectorsBlobPath(evaluationTypeId, META_FILE),
  ];
  try {
    await del(paths);
  } catch {
    /* ignore missing blobs */
  }
}
