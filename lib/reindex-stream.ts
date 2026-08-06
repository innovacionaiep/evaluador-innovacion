import { apiFetch } from "@/lib/api-fetch";
/** Client helper: consume NDJSON progress from POST /api/config/:id/reindex */

export type ReindexProgressEvent = {
  type: "progress";
  phase: "extract" | "embed" | "save";
  message: string;
  done?: number;
  total?: number;
};

export type ReindexDoneEvent = { type: "done"; chunkCount: number };
export type ReindexErrorEvent = { type: "error"; error: string };
export type ReindexStreamEvent = ReindexProgressEvent | ReindexDoneEvent | ReindexErrorEvent;

function parseLine(line: string): ReindexStreamEvent | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t) as ReindexStreamEvent;
    if (parsed?.type === "progress" || parsed?.type === "done" || parsed?.type === "error") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function runReindexStream(params: {
  evaluationTypeId: number;
  onProgress?: (message: string, event: ReindexProgressEvent) => void;
  signal?: AbortSignal;
}): Promise<{ chunkCount: number }> {
  const res = await apiFetch(`/api/config/${params.evaluationTypeId}/reindex`, {
    method: "POST",
    signal: params.signal,
  });

  const contentType = res.headers.get("content-type") ?? "";

  // Fallback si un proxy/deploy antiguo aún responde JSON
  if (!contentType.includes("ndjson")) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      chunkCount?: number;
      ok?: boolean;
    };
    if (!res.ok) throw new Error(data?.error || "Error al reindexar");
    return { chunkCount: data.chunkCount ?? 0 };
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data?.error || res.statusText || "Error al reindexar");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount: number | null = null;

  const handle = (event: ReindexStreamEvent) => {
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "progress") {
      params.onProgress?.(event.message, event);
      return;
    }
    if (event.type === "done") chunkCount = event.chunkCount;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseLine(line);
      if (event) handle(event);
    }
  }

  if (buffer.trim()) {
    const event = parseLine(buffer);
    if (event) handle(event);
  }

  if (chunkCount == null) throw new Error("Reindex terminó sin resultado");
  return { chunkCount };
}
