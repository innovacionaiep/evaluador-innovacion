import type { AgentTraceEntry } from "@/lib/agent-events";

/** Última línea visible para vista colapsada de streaming. */
export function getLastStreamLine(
  trace: AgentTraceEntry[],
  reportPreview: string,
  fallback = "Iniciando…"
): string {
  if (reportPreview.trim()) {
    const lines = reportPreview.trim().split(/\r?\n/).filter((l) => l.trim());
    const last = lines[lines.length - 1]?.trim();
    if (last) return last.length > 120 ? `${last.slice(0, 117)}…` : last;
  }

  const live = [...trace].reverse().find((t) => t.live);
  if (live?.title) return live.title;

  const last = trace[trace.length - 1];
  if (last?.title) return last.title;

  return fallback;
}
