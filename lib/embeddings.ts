import "server-only";

/** Re-export embeddings from OpenRouter (único proveedor de IA). */
export {
  embedTexts,
  embedQuery,
  createEmbeddings,
  type EmbeddingInputType,
} from "@/lib/openrouter";
