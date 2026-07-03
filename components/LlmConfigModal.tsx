"use client";

import { useState, useEffect } from "react";
import {
  LLM_USE_CASE_DEFAULTS,
  LLM_USE_CASE_LABELS,
  type LlmUseCase,
} from "@/lib/llm-config-types";

const USE_CASE_ORDER: LlmUseCase[] = [
  "chat",
  "router",
  "agent",
  "evaluate",
  "extract",
  "vision",
  "embeddings",
];

type LlmConfigResponse = {
  models: Record<LlmUseCase, string>;
  hasOpenRouterApiKey: boolean;
};

export default function LlmConfigModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [models, setModels] = useState<Record<LlmUseCase, string>>({
    ...LLM_USE_CASE_DEFAULTS,
  });
  const [hasOpenRouterApiKey, setHasOpenRouterApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setMessage(null);
    fetch("/api/llm-config")
      .then((r) => r.json())
      .then((data: LlmConfigResponse) => {
        if (data.models) setModels({ ...LLM_USE_CASE_DEFAULTS, ...data.models });
        setHasOpenRouterApiKey(!!data.hasOpenRouterApiKey);
      })
      .catch(() => setMessage("No se pudo cargar la configuración LLM."))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/llm-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      if (data.models) setModels({ ...LLM_USE_CASE_DEFAULTS, ...data.models });
      setHasOpenRouterApiKey(!!data.hasOpenRouterApiKey);
      setMessage("Configuración LLM guardada.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const inputClass =
    "w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#252526]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-600">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Configurar LLM
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            Cerrar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>
          ) : (
            <>
              <section className="mb-6">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  API key de OpenRouter
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Se configura únicamente con la variable de entorno{" "}
                  <code className="text-[11px]">OPENROUTER_API_KEY</code> (en{" "}
                  <code className="text-[11px]">.env.local</code> en local o en Vercel en
                  producción).
                </p>
                {hasOpenRouterApiKey ? (
                  <p className="mt-2 text-xs text-green-700 dark:text-green-400">
                    API key detectada en el entorno.
                  </p>
                ) : (
                  <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                    No se detectó <code>OPENROUTER_API_KEY</code>. Añádala al entorno antes de
                    usar el evaluador.
                  </p>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Modelos por función
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  ID de modelo en OpenRouter (ej.{" "}
                  <code className="text-[11px]">openai/gpt-4o</code>,{" "}
                  <code className="text-[11px]">anthropic/claude-3.5-sonnet</code>). Se guardan en
                  la base de datos y aplican en local y en Vercel.
                </p>
                <div className="mt-3 space-y-3">
                  {USE_CASE_ORDER.map((useCase) => (
                    <div key={useCase}>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        {LLM_USE_CASE_LABELS[useCase]}
                      </label>
                      <input
                        type="text"
                        value={models[useCase] ?? ""}
                        onChange={(e) =>
                          setModels((prev) => ({ ...prev, [useCase]: e.target.value }))
                        }
                        placeholder={LLM_USE_CASE_DEFAULTS[useCase]}
                        className={inputClass}
                      />
                    </div>
                  ))}
                </div>
              </section>

              {message && (
                <p
                  className={`mt-4 text-sm ${
                    message.includes("guardada")
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {message}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-600">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar modelos"}
          </button>
        </div>
      </div>
    </div>
  );
}
