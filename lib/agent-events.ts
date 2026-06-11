import type { RetrievedChunk } from "@/lib/rag-retrieve";

export type AgentChunkPreview = {
  id: string;
  docName: string;
  page?: number;
  printedPage?: number;
  score: number;
  preview: string;
  charCount: number;
};

/** Eventos de streaming del chat (NDJSON, una línea por evento). */
export type ChatStreamEvent =
  | { type: "step"; message: string; phase?: string }
  | { type: "intent"; intent: string; contextMode: string; label: string }
  | { type: "rag_query"; query: string; queries?: string[] }
  | { type: "chunks"; count: number; totalChars: number; chunks: AgentChunkPreview[] }
  | { type: "chunks_empty"; message: string }
  | { type: "context_section"; section: string; detail?: string }
  | { type: "thinking"; chunk: string }
  | { type: "content"; chunk: string }
  | { type: "done" }
  | { type: "error"; error: string };

export type BuildContextStreamEvent = Extract<
  ChatStreamEvent,
  | { type: "step" }
  | { type: "rag_query" }
  | { type: "chunks" }
  | { type: "chunks_empty" }
  | { type: "context_section" }
>;

export function chunkToPreview(c: RetrievedChunk): AgentChunkPreview {
  const normalized = c.text.replace(/\s+/g, " ").trim();
  const preview =
    normalized.length > 160 ? normalized.slice(0, 160) + "…" : normalized;
  return {
    id: c.id,
    docName: c.docName,
    page: c.page,
    printedPage: c.printedPage,
    score: Math.round(c.score * 1000) / 1000,
    preview,
    charCount: c.text.length,
  };
}

export function summarizeChunks(chunks: RetrievedChunk[]): {
  previews: AgentChunkPreview[];
  totalChars: number;
} {
  const previews = chunks.map(chunkToPreview);
  const totalChars = chunks.reduce((n, c) => n + c.text.length, 0);
  return { previews, totalChars };
}

export const INTENT_LABELS: Record<string, string> = {
  config: "Configuración (instrucciones, formato, elementos)",
  knowledge: "Manual / Knowledge de referencia",
  project: "Proyecto subido",
};

export type AgentTraceEntry = {
  id: string;
  kind: "step" | "intent" | "rag" | "chunks" | "context" | "thinking" | "answer";
  title: string;
  detail?: string;
  chunks?: AgentChunkPreview[];
  thinkingText?: string;
  live?: boolean;
};
