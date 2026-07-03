import type { AgentTraceEntry } from "@/lib/agent-events";
import {
  applyExtractStreamEvent,
  createExtractStreamState,
  parseExtractNdjsonLine,
} from "@/lib/extract-stream";
import type { ExtractStreamEvent } from "@/lib/project-extract-pipeline";
import type { ExtractedTableRow } from "@/hooks/useProjectExtract";

export type ExtractStreamResult = {
  elementsTable: ExtractedTableRow[];
  text: string;
  trace: AgentTraceEntry[];
  projectFilePaths: string[];
};

export async function runExtractStream(params: {
  projectFilePaths?: string[];
  projectFile?: File;
  evaluationTypeId: number;
  sessionId: string;
  onTraceUpdate?: (trace: AgentTraceEntry[]) => void;
  signal?: AbortSignal;
}): Promise<ExtractStreamResult> {
  let res: Response;

  if (params.projectFile) {
    const form = new FormData();
    form.set("sessionId", params.sessionId);
    form.set("evaluationTypeId", String(params.evaluationTypeId));
    form.set("stream", "true");
    form.set("skipReindex", "false");
    form.set("replace", "true");
    form.append("files", params.projectFile);
    res = await fetch("/api/project-extract", {
      method: "POST",
      body: form,
      signal: params.signal,
    });
  } else {
    res = await fetch("/api/project-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectFilePaths: params.projectFilePaths ?? [],
        evaluationTypeId: params.evaluationTypeId,
        sessionId: params.sessionId,
        stream: true,
        skipReindex: false,
      }),
      signal: params.signal,
    });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || res.statusText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let streamState = createExtractStreamState();
  let donePayload: (Extract<ExtractStreamEvent, { type: "done" }> & {
    projectFilePaths?: string[];
  }) | null = null;

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
      if (event.type === "error") throw new Error(event.error);
      streamState = applyExtractStreamEvent(streamState, event, true);
      params.onTraceUpdate?.(streamState.trace.map((t) => ({ ...t, live: false })));
      if (event.type === "done") donePayload = event;
    }
  }

  if (buffer.trim()) {
    const event = parseExtractNdjsonLine(buffer) as
      | (ExtractStreamEvent & { projectFilePaths?: string[] })
      | null;
    if (event) {
      if (event.type === "error") throw new Error(event.error);
      streamState = applyExtractStreamEvent(streamState, event, false);
      if (event.type === "done") donePayload = event;
    }
  }

  const table = Array.isArray(donePayload?.elementsTable)
    ? donePayload.elementsTable.map((r) => ({
        section: r.section,
        element: r.element,
        content: r.content,
        incomplete: r.incomplete,
      }))
    : [];

  return {
    elementsTable: table,
    text: typeof donePayload?.text === "string" ? donePayload.text : "",
    trace: streamState.trace.map((t) => ({ ...t, live: false })),
    projectFilePaths: Array.isArray(donePayload?.projectFilePaths)
      ? donePayload.projectFilePaths
      : params.projectFilePaths ?? [],
  };
}
