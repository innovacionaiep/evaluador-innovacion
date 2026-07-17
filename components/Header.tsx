"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import type { EvaluationMode } from "@/lib/evaluation-mode";

type EvaluationType = { id: number; name: string };

export default function Header({
  types,
  activeId,
  onSelect,
  onOpenConfig,
  onOpenHistory,
  evaluationMode,
  onEvaluationModeChange,
}: {
  types: EvaluationType[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onOpenConfig: () => void;
  onOpenHistory: () => void;
  evaluationMode: EvaluationMode;
  onEvaluationModeChange: (mode: EvaluationMode) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeType = types.find((t) => t.id === activeId);
  const title = activeType ? `Evaluador de ${activeType.name}` : "Evaluador";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  return (
    <header className="relative flex shrink-0 h-12 items-center justify-between overflow-visible border-b border-gray-200 bg-gray-50 px-4 dark:border-gray-700 dark:bg-[#252526]">
      <div className="flex items-center gap-3 min-w-0">
        <Image
          src="/logo.png"
          alt="Evaluador de Innovación"
          width={140}
          height={140}
          className="shrink-0"
          priority
        />
        <div
          className="h-6 w-0.5 shrink-0 bg-white"
          aria-hidden
        />
        <h1 className="ml-4 shrink-0 text-xl font-semibold text-gray-800 dark:text-gray-100 truncate">
          {title}
        </h1>

        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((open) => !open)}
            title="Cambiar evaluador"
            aria-label="Cambiar evaluador"
            aria-expanded={dropdownOpen}
            className="shrink-0 flex items-center justify-center rounded p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200/60 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/10 dark:focus:ring-gray-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m7 15 5 5 5-5" />
              <path d="m7 9 5-5 5 5" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-[#252526]">
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSelect(t.id);
                    setDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors focus:outline-none focus:bg-surface-hover ${
                    activeId === t.id
                      ? "bg-surface-elevated font-medium text-foreground"
                      : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {t.name}
                </button>
              ))}
              {types.length === 0 && (
                <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No hay tipos configurados
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-600 dark:bg-[#1e1e1e]">
        {(["bulk", "individual"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onEvaluationModeChange(mode)}
            className={`rounded-md px-4 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-gray-400 ${
              evaluationMode === mode
                ? "bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {mode === "bulk" ? "Masivo" : "Individual"}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenHistory}
          title="Historial de evaluaciones"
          aria-label="Historial de evaluaciones"
          className="shrink-0 flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200/60 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/10 dark:focus:ring-gray-500"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
          </svg>
          <span>Historial</span>
        </button>

        <ThemeSwitcher />

        <button
          type="button"
          onClick={onOpenConfig}
          title="Configuración"
          aria-label="Configuración"
          className="shrink-0 flex items-center justify-center rounded p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200/60 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/10 dark:focus:ring-gray-500"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
