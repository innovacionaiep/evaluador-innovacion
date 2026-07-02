import type { AgentTraceEntry, ChatStreamEvent } from "@/lib/agent-events";

let traceIdCounter = 0;
function nextTraceId(): string {
  traceIdCounter += 1;
  return `trace-${traceIdCounter}`;
}

export type ChatStreamState = {
  content: string;
  trace: AgentTraceEntry[];
  thinkingEntryId: string | null;
  projectElements?: { element: string; content: string }[];
};

export function createChatStreamState(): ChatStreamState {
  return { content: "", trace: [], thinkingEntryId: null };
}

export function applyChatStreamEvent(
  state: ChatStreamState,
  event: ChatStreamEvent,
  live: boolean
): ChatStreamState {
  const trace = [...state.trace];
  let content = state.content;
  let thinkingEntryId = state.thinkingEntryId;
  let projectElements = state.projectElements;

  switch (event.type) {
    case "step": {
      trace.push({
        id: nextTraceId(),
        kind: event.phase === "thinking" ? "thinking" : event.phase === "answer" ? "answer" : "step",
        title: event.message,
        live: live && event.phase !== "answer",
      });
      break;
    }
    case "plan": {
      trace.push({
        id: nextTraceId(),
        kind: "plan",
        title: `Plan agente (Nivel ${event.agentLevel}) — ${event.label}`,
        detail: `${event.reasoning}\n\n${event.summary}`,
      });
      break;
    }
    case "intent": {
      trace.push({
        id: nextTraceId(),
        kind: "intent",
        title: `Intención: ${event.label}`,
        detail: `Modo de contexto: ${event.contextMode}`,
      });
      break;
    }
    case "tool_call": {
      trace.push({
        id: nextTraceId(),
        kind: "tool",
        title: `Herramienta: ${event.tool}`,
        detail: JSON.stringify(event.arguments, null, 0).slice(0, 500),
      });
      break;
    }
    case "tool_result": {
      trace.push({
        id: nextTraceId(),
        kind: "tool",
        title: `Resultado: ${event.tool}`,
        detail: event.summary,
      });
      break;
    }
    case "rag_query": {
      const queryDetail =
        event.queries && event.queries.length > 1
          ? event.queries.map((q, i) => `${i + 1}. ${q}`).join("\n")
          : event.query;
      trace.push({
        id: nextTraceId(),
        kind: "rag",
        title: "Consulta de búsqueda en Knowledge",
        detail: queryDetail,
      });
      break;
    }
    case "chunks": {
      trace.push({
        id: nextTraceId(),
        kind: "chunks",
        title: `${event.count} fragmento(s) recuperado(s) del índice RAG`,
        detail: `${event.totalChars.toLocaleString("es")} caracteres de contexto documental`,
        chunks: event.chunks,
      });
      break;
    }
    case "chunks_empty": {
      trace.push({
        id: nextTraceId(),
        kind: "chunks",
        title: "Sin fragmentos en el índice",
        detail: event.message,
      });
      break;
    }
    case "context_section": {
      trace.push({
        id: nextTraceId(),
        kind: "context",
        title: `Contexto: ${event.section}`,
        detail: event.detail,
      });
      break;
    }
    case "thinking": {
      if (!thinkingEntryId) {
        thinkingEntryId = nextTraceId();
        trace.push({
          id: thinkingEntryId,
          kind: "thinking",
          title: "Razonamiento del modelo",
          thinkingText: event.chunk,
          live: true,
        });
      } else {
        const idx = trace.findIndex((t) => t.id === thinkingEntryId);
        if (idx >= 0) {
          const prev = trace[idx];
          trace[idx] = {
            ...prev,
            thinkingText: (prev.thinkingText ?? "") + event.chunk,
            live: true,
          };
        }
      }
      break;
    }
    case "content": {
      content += event.chunk;
      if (thinkingEntryId) {
        const idx = trace.findIndex((t) => t.id === thinkingEntryId);
        if (idx >= 0) {
          trace[idx] = { ...trace[idx], live: false };
        }
      }
      break;
    }
    case "project_elements_updated": {
      projectElements = event.elements;
      trace.push({
        id: nextTraceId(),
        kind: "step",
        title: "Elementos del proyecto actualizados",
        detail: `${event.elements.length} elemento(s) tras re-extracción`,
      });
      break;
    }
    case "done": {
      for (let i = 0; i < trace.length; i++) {
        if (trace[i].live) trace[i] = { ...trace[i], live: false };
      }
      break;
    }
    case "error":
      break;
  }

  return { content, trace, thinkingEntryId, projectElements };
}

export function parseNdjsonLine(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as ChatStreamEvent;
  } catch {
    return null;
  }
}
