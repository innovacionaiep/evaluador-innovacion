"use client";

import { useState } from "react";
import type { AgentChunkPreview, AgentTraceEntry } from "@/lib/agent-events";

export type { AgentTraceEntry };

const KIND_STYLES: Record<AgentTraceEntry["kind"], string> = {
  step: "text-gray-600 dark:text-gray-400",
  plan: "text-indigo-600 dark:text-indigo-400",
  intent: "text-violet-600 dark:text-violet-400",
  tool: "text-cyan-600 dark:text-cyan-400",
  rag: "text-blue-600 dark:text-blue-400",
  chunks: "text-emerald-600 dark:text-emerald-400",
  context: "text-amber-600 dark:text-amber-400",
  thinking: "text-fuchsia-600 dark:text-fuchsia-400",
  answer: "text-sky-600 dark:text-sky-400",
};

const KIND_ICONS: Record<AgentTraceEntry["kind"], string> = {
  step: "◎",
  plan: "◆",
  intent: "◈",
  tool: "⚙",
  rag: "⌕",
  chunks: "▤",
  context: "▣",
  thinking: "◐",
  answer: "✎",
};

function ChunkList({ chunks }: { chunks: AgentChunkPreview[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-emerald-700 underline decoration-dotted hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        {open ? "Ocultar" : "Ver"} {chunks.length} fragmento(s)
      </button>
      {open && (
        <ul className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto rounded border border-gray-200 bg-white/80 p-2 dark:border-gray-600 dark:bg-gray-900/50">
          {chunks.map((c) => (
            <li key={c.id} className="text-xs text-gray-700 dark:text-gray-300">
              <div className="font-medium text-gray-800 dark:text-gray-200">
                {c.docName}
                {c.printedPage != null
                  ? ` · pág. ${c.printedPage}`
                  : c.page != null
                    ? ` · PDF ${c.page}`
                    : ""}
                <span className="ml-1 font-normal text-gray-500">
                  (score {c.score}, {c.charCount.toLocaleString("es")} car.)
                </span>
              </div>
              <p className="mt-0.5 text-gray-600 dark:text-gray-400">{c.preview}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThinkingBlock({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(live ?? false);
  if (!text.trim()) return null;
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-fuchsia-700 underline decoration-dotted hover:text-fuchsia-900 dark:text-fuchsia-400"
      >
        {open ? "Ocultar razonamiento" : "Ver razonamiento del modelo"}
        {live && open ? " (en vivo…)" : ""}
      </button>
      {open && (
        <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-fuchsia-200 bg-fuchsia-50/80 p-2 text-xs text-fuchsia-950 dark:border-fuchsia-900 dark:bg-fuchsia-950/30 dark:text-fuchsia-100">
          {text}
        </pre>
      )}
    </div>
  );
}

export default function AgentTrace({
  entries,
  isActive,
  isRevealing,
}: {
  entries: AgentTraceEntry[];
  isActive?: boolean;
  /** Hay pasos en cola que aún no se muestran (revelado escalonado). */
  isRevealing?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (entries.length === 0 && !isActive) return null;

  return (
    <div className="mb-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/90 dark:border-gray-600 dark:bg-gray-900/40">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Actividad del agente
          {isActive && (
            <span className="ml-2 inline-flex items-center gap-1 font-normal normal-case text-gray-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              en curso
            </span>
          )}
        </span>
        <span className="text-xs text-gray-400">{collapsed ? "Mostrar" : "Ocultar"}</span>
      </button>
      {!collapsed && (
        <ol className="space-y-2 border-t border-gray-200 px-2.5 py-2 dark:border-gray-700">
          {entries.map((entry) => (
            <li key={entry.id} className="agent-trace-step-in flex gap-2 text-xs">
              <span className={`mt-0.5 shrink-0 ${KIND_STYLES[entry.kind]}`} aria-hidden>
                {KIND_ICONS[entry.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${KIND_STYLES[entry.kind]}`}>{entry.title}</p>
                {entry.detail && (
                  <p className="mt-0.5 text-gray-600 dark:text-gray-400">{entry.detail}</p>
                )}
                {entry.chunks && entry.chunks.length > 0 && (
                  <ChunkList chunks={entry.chunks} />
                )}
                {entry.thinkingText && (
                  <ThinkingBlock text={entry.thinkingText} live={entry.live} />
                )}
              </div>
            </li>
          ))}
          {isActive && entries.length === 0 && (
            <li className="text-xs text-gray-500 dark:text-gray-400">Iniciando…</li>
          )}
          {isRevealing && (
            <li className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="mt-0.5 inline-block h-3 w-3 animate-pulse rounded-full bg-gray-400 dark:bg-gray-500" aria-hidden />
              <span>Preparando siguiente paso…</span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
