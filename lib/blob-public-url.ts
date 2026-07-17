/**
 * Helpers de URL pública de Vercel Blob (sin server-only: usables en tests).
 */

/**
 * Store id para construir URLs públicas sin head().
 * Prefer BLOB_STORE_ID; si no, intenta parsear BLOB_READ_WRITE_TOKEN.
 */
export function blobStoreId(): string | null {
  const fromEnv = process.env.BLOB_STORE_ID?.trim();
  if (fromEnv) {
    return fromEnv.replace(/^store_/, "");
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return null;
  // vercel_blob_rw_<storeId>_<secret>
  const m = /^vercel_blob_rw_([^_]+)_/.exec(token);
  return m?.[1] ?? null;
}

/** URL pública determinista para pathname fijo (addRandomSuffix: false). Null si no hay store id. */
export function publicBlobUrl(pathname: string): string | null {
  const storeId = blobStoreId();
  if (!storeId) return null;
  const path = pathname.replace(/^\//, "");
  return `https://${storeId}.public.blob.vercel-storage.com/${path}`;
}
