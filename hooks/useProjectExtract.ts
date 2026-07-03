"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage } from "@/components/ChatPanel";
import type { AgentTraceEntry } from "@/lib/agent-events";
import type { ProjectStructuredData } from "@/lib/build-context";
import {
  applyExtractStreamEvent,
  createExtractStreamState,
  formatExtractCompletionMessage,
  parseExtractNdjsonLine,
} from "@/lib/extract-stream";
import type { ExtractStreamEvent } from "@/lib/project-extract-pipeline";
import { createStaggeredTraceReveal } from "@/lib/trace-reveal";

const MAX_EXTRACT_RETRIES = 5;
const EXTRACT_RETRY_DELAY_MS = 3000;

export type ExtractedTableRow = {
  section?: string;
  element: string;
  content: string;
  incomplete?: boolean;
};

function filesKey(files: File[]): string {
  return files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|");
}

export function useProjectExtract(
  projectFiles: File[],
  activeTypeId: number | null,
  sessionId: string,
  knowledgeDocNames: string[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  onProjectFilePaths?: (paths: string[]) => void
) {
  const [extractedProjectText, setExtractedProjectText] = useState("");
  const [extractedProjectTable, setExtractedProjectTable] = useState<ExtractedTableRow[]>([]);
  const [extractedStructuredData, setExtractedStructuredData] = useState<ProjectStructuredData | null>(
    null
  );
  const [extractedProjectLoading, setExtractedProjectLoading] = useState(false);

  const knowledgeDocNamesRef = useRef(knowledgeDocNames);
  const extractRevealRef = useRef<ReturnType<typeof createStaggeredTraceReveal> | null>(null);
  const extractCompletionPendingRef = useRef<string | null>(null);
  const extractTraceMsgIndexRef = useRef(-1);
  const extractFullTraceRef = useRef<AgentTraceEntry[]>([]);
  const evaluationTypeIdRef = useRef(activeTypeId);
  const onPathsRef = useRef(onProjectFilePaths);

  useEffect(() => {
    knowledgeDocNamesRef.current = knowledgeDocNames;
  }, [knowledgeDocNames]);

  useEffect(() => {
    evaluationTypeIdRef.current = activeTypeId;
  }, [activeTypeId]);

  useEffect(() => {
    onPathsRef.current = onProjectFilePaths;
  }, [onProjectFilePaths]);

  useEffect(() => {
    if (projectFiles.length === 0) {
      setExtractedProjectText("");
      setExtractedProjectTable([]);
      setExtractedStructuredData(null);
      setExtractedProjectLoading(false);
      return;
    }

    let cancelled = false;
    let currentController: AbortController | null = null;
    const filesSnapshot = [...projectFiles];

    const applyDonePayload = (
      event: Extract<ExtractStreamEvent, { type: "done" }> & { projectFilePaths?: string[] }
    ) => {
      const text = typeof event.text === "string" ? event.text : "";
      const table = Array.isArray(event.elementsTable)
        ? event.elementsTable.map((r) => ({
            section: r.section,
            element: r.element,
            content: r.content,
            incomplete: r.incomplete,
          }))
        : [];
      const sd = event.structuredData;
      setExtractedProjectText(text);
      setExtractedProjectTable(table);
      setExtractedStructuredData(sd && "files" in sd && sd.files?.length ? sd : null);
      setExtractedProjectLoading(false);
      if (Array.isArray(event.projectFilePaths) && event.projectFilePaths.length > 0) {
        onPathsRef.current?.(event.projectFilePaths);
      }
    };

    const appendExtractCompletion = () => {
      const msg = extractCompletionPendingRef.current;
      if (!msg) return;
      extractCompletionPendingRef.current = null;
      const fullTrace = extractFullTraceRef.current;

      setMessages((prev) => {
        const next = [...prev];
        const traceIdx = extractTraceMsgIndexRef.current;
        if (traceIdx >= 0 && traceIdx < next.length && next[traceIdx]?.role === "assistant") {
          next[traceIdx] = {
            ...next[traceIdx],
            trace: fullTrace.map((t) => ({ ...t, live: false })),
            traceRevealing: false,
            content: "",
          };
        }
        const alreadyHas = next.some(
          (m, i) =>
            i !== traceIdx &&
            m.role === "assistant" &&
            m.content === msg &&
            !(m.trace?.length || m.traceRevealing)
        );
        if (!alreadyHas) {
          next.push({ role: "assistant", content: msg });
        }
        return next;
      });

      extractRevealRef.current?.destroy();
      extractRevealRef.current = null;
      extractTraceMsgIndexRef.current = -1;
    };

    const startExtractMessage = () => {
      extractRevealRef.current?.destroy();
      extractTraceMsgIndexRef.current = -1;
      extractFullTraceRef.current = [];
      const reveal = createStaggeredTraceReveal((revealed) => {
        setMessages((prev) => {
          const next = [...prev];
          const traceIdx = extractTraceMsgIndexRef.current;
          if (traceIdx < 0 || traceIdx >= next.length || next[traceIdx]?.role !== "assistant") {
            return next;
          }
          next[traceIdx] = {
            ...next[traceIdx],
            content: "",
            trace: revealed.trace,
            traceRevealing: revealed.revealing,
          };
          return next;
        });
        if (!revealed.revealing && extractCompletionPendingRef.current) {
          appendExtractCompletion();
        }
      });
      reveal.onFullyRevealed(() => {
        if (extractCompletionPendingRef.current) {
          appendExtractCompletion();
        }
      });
      extractRevealRef.current = reveal;
      setMessages((prev) => {
        const next: ChatMessage[] = [
          ...prev,
          { role: "assistant", content: "", trace: [], traceRevealing: true },
        ];
        extractTraceMsgIndexRef.current = next.length - 1;
        return next;
      });
      return reveal;
    };

    const processExtractEvent = (
      event: ExtractStreamEvent & { projectFilePaths?: string[] },
      streamState: ReturnType<typeof createExtractStreamState>,
      reveal: ReturnType<typeof createStaggeredTraceReveal>,
      live: boolean
    ) => {
      if (event.type === "error") throw new Error(event.error);
      const nextState = applyExtractStreamEvent(streamState, event, live);
      const trace = nextState.trace.map((t) => ({ ...t, live: live && t.live }));
      extractFullTraceRef.current = trace;
      if (event.type === "done") {
        extractCompletionPendingRef.current = formatExtractCompletionMessage(
          knowledgeDocNamesRef.current
        );
        applyDonePayload(event);
      }
      reveal.setState(trace, "");
      return nextState;
    };

    const doFetch = (attempt: number) => {
      if (cancelled) return;
      extractCompletionPendingRef.current = null;
      const reveal = startExtractMessage();
      let streamState = createExtractStreamState();
      currentController = new AbortController();

      const form = new FormData();
      form.set("sessionId", sessionId);
      if (evaluationTypeIdRef.current != null) {
        form.set("evaluationTypeId", String(evaluationTypeIdRef.current));
      }
      form.set("stream", "true");
      form.set("skipReindex", "false");
      form.set("replace", "true");
      for (const file of filesSnapshot) {
        form.append("files", file);
      }

      fetch("/api/project-extract", {
        method: "POST",
        body: form,
        signal: currentController.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || res.statusText);
          }
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No response body");
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const event = parseExtractNdjsonLine(line) as
                | (ExtractStreamEvent & { projectFilePaths?: string[] })
                | null;
              if (!event) continue;
              streamState = processExtractEvent(event, streamState, reveal, true);
            }
          }
          if (buffer.trim()) {
            const event = parseExtractNdjsonLine(buffer) as
              | (ExtractStreamEvent & { projectFilePaths?: string[] })
              | null;
            if (event) {
              streamState = processExtractEvent(event, streamState, reveal, false);
            }
          }
          if (!extractCompletionPendingRef.current) {
            extractCompletionPendingRef.current = formatExtractCompletionMessage(
              knowledgeDocNamesRef.current
            );
            streamState = applyExtractStreamEvent(streamState, { type: "done", text: "" }, false);
            extractFullTraceRef.current = streamState.trace;
            reveal.setState(streamState.trace, "");
          }
          if (extractCompletionPendingRef.current) {
            reveal.onFullyRevealed(() => {
              if (extractCompletionPendingRef.current) {
                appendExtractCompletion();
              }
            });
          }
        })
        .catch((err) => {
          extractCompletionPendingRef.current = null;
          extractRevealRef.current?.flushAll();
          setExtractedProjectText("");
          setExtractedProjectTable([]);
          setExtractedStructuredData(null);
          const msg = err?.message?.includes("429")
            ? "Extracción fallida: límite de uso temporal. Reintente en unos momentos."
            : "Extracción fallida.";
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant" && last.traceRevealing) {
              next[next.length - 1] = {
                ...last,
                content: msg,
                traceRevealing: false,
              };
            } else {
              next.push({ role: "assistant", content: msg });
            }
            return next;
          });
          if (
            attempt < MAX_EXTRACT_RETRIES - 1 &&
            err?.message?.includes("429") &&
            !cancelled
          ) {
            setTimeout(() => {
              if (cancelled) return;
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `Reintentando extracción (intento ${attempt + 2}/${MAX_EXTRACT_RETRIES})…`,
                },
              ]);
              doFetch(attempt + 1);
            }, EXTRACT_RETRY_DELAY_MS);
          } else {
            setExtractedProjectLoading(false);
          }
        });
    };

    setExtractedProjectLoading(true);
    doFetch(0);

    return () => {
      cancelled = true;
      currentController?.abort();
      extractRevealRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filesKey establece identidad del lote
  }, [filesKey(projectFiles), sessionId, setMessages]);

  const resetExtract = useCallback(() => {
    setExtractedProjectText("");
    setExtractedProjectTable([]);
    setExtractedStructuredData(null);
    setExtractedProjectLoading(false);
  }, []);

  return {
    extractedProjectText,
    extractedProjectTable,
    setExtractedProjectTable,
    extractedStructuredData,
    extractedProjectLoading,
    resetExtract,
  };
}
