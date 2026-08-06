/**
 * Tipos lógicos de embedding (RAG) y alias por proveedor.
 * OpenRouter documenta search_query/search_document; Nvidia NIM solo acepta query/passage.
 */

export type EmbeddingInputType = "search_query" | "search_document";

export type ProviderEmbeddingInputType =
  | EmbeddingInputType
  | "query"
  | "passage"
  | "document";

/** ¿El mensaje del proveedor indica rechazo de input_type? */
export function isEmbeddingInputTypeError(message: string): boolean {
  return /input_type/i.test(message);
}

/**
 * Orden de intento de `input_type` según el modelo.
 * Nvidia primero (query/passage) para evitar un 400 inútil y perder el reintento real bajo carga.
 */
export function embeddingInputTypeCandidates(
  logical: EmbeddingInputType,
  model: string
): ProviderEmbeddingInputType[] {
  const nvidia = /nvidia/i.test(model);
  if (logical === "search_query") {
    return nvidia ? ["query", "search_query"] : ["search_query", "query"];
  }
  return nvidia
    ? ["passage", "search_document", "document"]
    : ["search_document", "passage", "document"];
}
