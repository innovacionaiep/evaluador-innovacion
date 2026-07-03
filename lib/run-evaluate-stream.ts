import type { AgentTraceEntry } from "@/lib/agent-events";
import {
  applyEvaluateStreamEvent,
  createEvaluateStreamState,
  parseEvaluateNdjsonLine,
} from "@/lib/evaluate-stream";
import { stripCharacterLimitAnnotations } from "@/lib/report-format-limits";

export type EvaluateStreamResult = {
  reportContent: string;
  subdimensionScores: Record<string, number | null>;
  overallScore: number | null;
  evaluationSummary: string;
  trace: AgentTraceEntry[];
};

function formatReportContent(text: string): string {
  return stripCharacterLimitAnnotations(text);
}

export async function runEvaluateStream(params: {
  evaluationTypeId: number;
  projectElementsTable: { element: string; content: string }[];
  onTraceUpdate?: (trace: AgentTraceEntry[]) => void;
  onContentUpdate?: (reportContent: string) => void;
  signal?: AbortSignal;
}): Promise<EvaluateStreamResult> {
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evaluationTypeId: params.evaluationTypeId,
      projectElementsTable: params.projectElementsTable,
    }),
    signal: params.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || err?.error || res.statusText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let streamState = createEvaluateStreamState();
  let reportContent = "";
  let subdimensionScores: Record<string, number | null> = {};
  let overallScore: number | null = null;
  let evaluationSummary = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseEvaluateNdjsonLine(line);
      if (!event) continue;
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "content") {
        reportContent += event.chunk;
        params.onContentUpdate?.(formatReportContent(reportContent));
        continue;
      }
      if (event.type === "report_content") {
        reportContent = event.content;
        params.onContentUpdate?.(formatReportContent(reportContent));
        continue;
      }
      if (event.type === "subdimension_score") {
        const key = `${event.dimension} / ${event.name}`;
        subdimensionScores[key] = event.score;
      }
      if (event.type === "scores_summary") {
        subdimensionScores = { ...event.subdimensionScores };
        overallScore = event.overallScore;
      }
      if (event.type === "evaluation_summary") {
        evaluationSummary = event.text;
      }
      streamState = applyEvaluateStreamEvent(streamState, event, true);
      params.onTraceUpdate?.(
        streamState.trace.map((t, i) => ({
          ...t,
          live: i === streamState.trace.length - 1 && t.live,
        }))
      );
    }
  }

  if (buffer.trim()) {
    const event = parseEvaluateNdjsonLine(buffer);
    if (event) {
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "content") {
        reportContent += event.chunk;
        params.onContentUpdate?.(formatReportContent(reportContent));
      }
      if (event.type === "report_content") {
        reportContent = event.content;
        params.onContentUpdate?.(formatReportContent(reportContent));
      }
      if (event.type === "scores_summary") {
        subdimensionScores = { ...event.subdimensionScores };
        overallScore = event.overallScore;
      }
      if (event.type === "evaluation_summary") {
        evaluationSummary = event.text;
      }
      if (event.type !== "content") {
        streamState = applyEvaluateStreamEvent(streamState, event, false);
      }
    }
  }

  return {
    reportContent: formatReportContent(reportContent),
    subdimensionScores,
    overallScore,
    evaluationSummary,
    trace: streamState.trace.map((t) => ({ ...t, live: false })),
  };
}
