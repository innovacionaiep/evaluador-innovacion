/** Tipos y constantes LLM compartidos (sin fs — seguro para cliente). */

export type LlmUseCase =
  | "chat"
  | "router"
  | "agent"
  | "evaluate"
  | "extract"
  | "vision"
  | "embeddings";

export const LLM_USE_CASE_LABELS: Record<LlmUseCase, string> = {
  chat: "Chat (respuestas al usuario)",
  router: "Router de contexto (planificación)",
  agent: "Agente con herramientas",
  evaluate: "Evaluación / informe",
  extract: "Extracción de elementos (texto)",
  vision: "Extracción con visión (imágenes)",
  embeddings: "Embeddings RAG",
};

export const LLM_USE_CASE_DEFAULTS: Record<LlmUseCase, string> = {
  chat: "openai/gpt-4o",
  router: "openai/gpt-4o-mini",
  agent: "openai/gpt-4o",
  evaluate: "openai/gpt-4o",
  extract: "openai/gpt-4o-mini",
  vision: "openai/gpt-4o",
  embeddings: "openai/text-embedding-3-small",
};

export type LlmConfigPublic = {
  models: Record<LlmUseCase, string>;
  hasOpenRouterApiKey: boolean;
};
