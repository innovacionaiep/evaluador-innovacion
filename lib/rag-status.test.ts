import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { ragStatusFromMeta } from "@/lib/rag-status-utils";
import {
  clearAsyncChunkCache,
  getCachedChunksAsync,
  getCachedMetaAsync,
  invalidateAsyncChunkCache,
  metaCacheKey,
} from "@/lib/chunk-cache-async";
import { blobStoreId, publicBlobUrl } from "@/lib/blob-public-url";
import type { StoredChunk } from "@/lib/vector-store";

describe("rag-status", () => {
  it("ragStatusFromMeta usa chunkCount y chunksFileBytes del meta", () => {
    const stats = ragStatusFromMeta({
      indexedAt: "2024-07-03T12:00:00.000Z",
      knowledgeVersion: '["Manual OSLO.pdf"]',
      chunkCount: 1322,
      chunksFileBytes: 38_200_000,
    });
    assert.equal(stats.chunkCount, 1322);
    assert.equal(stats.chunksFileBytes, 38_200_000);
    assert.equal(stats.hasIndex, true);
    assert.equal(stats.indexedAt, "2024-07-03T12:00:00.000Z");
    assert.equal(stats.knowledgeVersion, '["Manual OSLO.pdf"]');
  });

  it("ragStatusFromMeta sin chunkCount usa fallback", () => {
    const stats = ragStatusFromMeta(
      { indexedAt: "2024-01-01T00:00:00.000Z" },
      { chunkCount: 10, chunksFileBytes: 5000 }
    );
    assert.equal(stats.chunkCount, 10);
    assert.equal(stats.chunksFileBytes, 5000);
    assert.equal(stats.hasIndex, true);
  });

  it("ragStatusFromMeta índice vacío", () => {
    const stats = ragStatusFromMeta({
      indexedAt: "2024-01-01T00:00:00.000Z",
      knowledgeVersion: "empty",
      chunkCount: 0,
      chunksFileBytes: 2,
    });
    assert.equal(stats.hasIndex, false);
    assert.equal(stats.chunkCount, 0);
  });
});

describe("publicBlobUrl", () => {
  const prevStore = process.env.BLOB_STORE_ID;
  const prevToken = process.env.BLOB_READ_WRITE_TOKEN;

  afterEach(() => {
    if (prevStore === undefined) delete process.env.BLOB_STORE_ID;
    else process.env.BLOB_STORE_ID = prevStore;
    if (prevToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevToken;
  });

  it("construye URL con BLOB_STORE_ID y normaliza store_", () => {
    process.env.BLOB_STORE_ID = "store_AbCdEf123";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.equal(blobStoreId(), "AbCdEf123");
    assert.equal(
      publicBlobUrl("knowledge/1/vectors/chunks.json"),
      "https://AbCdEf123.public.blob.vercel-storage.com/knowledge/1/vectors/chunks.json"
    );
  });

  it("parsea store id desde BLOB_READ_WRITE_TOKEN", () => {
    delete process.env.BLOB_STORE_ID;
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_XyZ99_secrettokenhere";
    assert.equal(blobStoreId(), "XyZ99");
    assert.ok(publicBlobUrl("meta.json")?.includes("XyZ99.public.blob.vercel-storage.com"));
  });

  it("null sin store id ni token parseable", () => {
    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.equal(blobStoreId(), null);
    assert.equal(publicBlobUrl("x"), null);
  });
});

describe("chunk-cache-async", () => {
  beforeEach(() => {
    clearAsyncChunkCache();
  });

  it("cachea el resultado del loader", async () => {
    let loads = 0;
    const loader = async (): Promise<StoredChunk[]> => {
      loads++;
      return [{ id: "a", docName: "d", text: "t", embedding: [1] }];
    };

    const first = await getCachedChunksAsync("knowledge:1", loader);
    const second = await getCachedChunksAsync("knowledge:1", loader);

    assert.equal(loads, 1);
    assert.equal(first.length, 1);
    assert.equal(second[0]?.id, "a");
  });

  it("invalida entrada y vuelve a cargar", async () => {
    let loads = 0;
    const loader = async (): Promise<StoredChunk[]> => {
      loads++;
      return [];
    };

    await getCachedChunksAsync("knowledge:2", loader);
    invalidateAsyncChunkCache("knowledge:2");
    await getCachedChunksAsync("knowledge:2", loader);

    assert.equal(loads, 2);
  });

  it("cachea meta e invalida junto con chunks", async () => {
    let loads = 0;
    const loader = async () => {
      loads++;
      return { indexedAt: "2024-01-01T00:00:00.000Z", chunkCount: 3, chunksFileBytes: 100 };
    };

    await getCachedMetaAsync("knowledge:9", loader);
    await getCachedMetaAsync("knowledge:9", loader);
    assert.equal(loads, 1);
    assert.equal(metaCacheKey("knowledge:9"), "knowledge:9:meta");

    invalidateAsyncChunkCache("knowledge:9");
    await getCachedMetaAsync("knowledge:9", loader);
    assert.equal(loads, 2);
  });
});
