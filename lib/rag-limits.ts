/** Modos de construcción de contexto (chat y evaluación). */
export type ContextMode =
  | "chat-config"
  | "chat-knowledge"
  | "chat-chapter"
  | "chat-project"
  | "evaluate";

export type RagLimits = {
  topK: number;
  maxRetrievedChars: number;
  maxSystemChars: number;
  skipKnowledge: boolean;
};

export const CONTEXT_LIMITS: Record<ContextMode, RagLimits> = {
  "chat-config": {
    topK: 0,
    maxRetrievedChars: 0,
    maxSystemChars: 48_000,
    skipKnowledge: true,
  },
  "chat-knowledge": {
    topK: 45,
    maxRetrievedChars: 32_000,
    maxSystemChars: 96_000,
    skipKnowledge: false,
  },
  "chat-chapter": {
    topK: 0,
    maxRetrievedChars: 64_000,
    maxSystemChars: 72_000,
    skipKnowledge: false,
  },
  "chat-project": {
    topK: 20,
    maxRetrievedChars: 14_000,
    maxSystemChars: 72_000,
    skipKnowledge: false,
  },
  evaluate: {
    topK: 55,
    maxRetrievedChars: 48_000,
    maxSystemChars: 110_000,
    skipKnowledge: false,
  },
};

export const RAG_QUERY_PROMPT_CHARS = 500;
export const RAG_QUERY_RUBRIC_CHARS = 500;
