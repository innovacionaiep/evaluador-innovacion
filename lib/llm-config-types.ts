/** Tipos y constantes LLM compartidos (sin fs — seguro para cliente). */

export type LlmUseCase =
  | "chat"
  | "router"
  | "agent"
  | "evaluate"
  | "extract"
  | "vision"
  | "embeddings";

export const LLM_USE_CASES: LlmUseCase[] = [
  "chat",
  "router",
  "agent",
  "evaluate",
  "extract",
  "vision",
  "embeddings",
];

export const LLM_USE_CASE_LABELS: Record<LlmUseCase, string> = {
  chat: "Chat (respuestas al usuario)",
  router: "Router de contexto (planificación)",
  agent: "Agente con herramientas",
  evaluate: "Evaluación / informe",
  extract: "Extracción de elementos (texto)",
  vision: "Extracción con visión (imágenes)",
  embeddings: "Embeddings RAG",
};

export function emptyLlmModels(): Record<LlmUseCase, string> {
  return {
    chat: "",
    router: "",
    agent: "",
    evaluate: "",
    extract: "",
    vision: "",
    embeddings: "",
  };
}

export function isLlmModelsComplete(models: Record<LlmUseCase, string>): boolean {
  return LLM_USE_CASES.every((useCase) => !!models[useCase]?.trim());
}

export type LlmConfigPublic = {
  models: Record<LlmUseCase, string>;
  hasOpenRouterApiKey: boolean;
  modelsComplete: boolean;
};
