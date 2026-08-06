import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  embeddingInputTypeCandidates,
  isEmbeddingInputTypeError,
} from "@/lib/embedding-input-type";

describe("embeddingInputTypeCandidates", () => {
  it("prioriza query/passage para modelos Nvidia", () => {
    assert.deepEqual(embeddingInputTypeCandidates("search_query", "nvidia/llama-embed-qa"), [
      "query",
      "search_query",
    ]);
    assert.deepEqual(
      embeddingInputTypeCandidates("search_document", "NVIDIA/nv-embedqa-e5-v5"),
      ["passage", "search_document", "document"]
    );
  });

  it("prioriza search_* para el resto de modelos", () => {
    assert.deepEqual(embeddingInputTypeCandidates("search_query", "openai/text-embedding-3-small"), [
      "search_query",
      "query",
    ]);
    assert.deepEqual(embeddingInputTypeCandidates("search_document", "openai/text-embedding-3-small"), [
      "search_document",
      "passage",
      "document",
    ]);
  });
});

describe("isEmbeddingInputTypeError", () => {
  it("detecta el rechazo de Nvidia por search_query", () => {
    const msg =
      'Unsupported input_type "search_query". Nvidia embeddings only support "query" and "passage"';
    assert.equal(isEmbeddingInputTypeError(msg), true);
  });

  it("no marca errores ajenos", () => {
    assert.equal(isEmbeddingInputTypeError("rate limit exceeded"), false);
  });
});
