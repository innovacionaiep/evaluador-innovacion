"use client";

import { useState, useEffect, useRef } from "react";

type EvaluationType = { id: number; name: string };
type KnowledgeItem = string | { name: string; url: string };
type Config = { prompt: string; knowledge_paths: KnowledgeItem[]; rubric_path: string };

export default function ConfigPanel({
  isOpen,
  onClose,
  types,
  activeId,
  onTypesChange,
  onSelectType,
}: {
  isOpen: boolean;
  onClose: () => void;
  types: EvaluationType[];
  activeId: number | null;
  onTypesChange: () => void;
  onSelectType: (id: number) => void;
}) {
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [config, setConfig] = useState<Config>({ prompt: "", knowledge_paths: [], rubric_path: "" });
  const [newTypeName, setNewTypeName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && activeId) setSelectedTypeId(activeId);
  }, [isOpen, activeId]);

  useEffect(() => {
    if (!selectedTypeId) {
      setConfig({ prompt: "", knowledge_paths: [], rubric_path: "" });
      return;
    }
    setLoading(true);
    fetch(`/api/config/${selectedTypeId}`)
      .then((r) => r.json())
      .then((data) => {
        setConfig({
          prompt: data.prompt ?? "",
          knowledge_paths: Array.isArray(data.knowledge_paths) ? data.knowledge_paths : [],
          rubric_path: data.rubric_path ?? "",
        });
      })
      .catch(() => setConfig({ prompt: "", knowledge_paths: [], rubric_path: "" }))
      .finally(() => setLoading(false));
  }, [selectedTypeId]);

  const handleCreateType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/evaluation-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        // #region agent log
        const errBody = await res.json().catch(() => ({}));
        fetch("http://127.0.0.1:7243/ingest/2cfbb0df-8ae8-4230-9f25-74fe2cc0dcdd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "components/ConfigPanel.tsx:handleCreateType",
            message: "API error response",
            data: { status: res.status, errorBody: errBody },
            timestamp: Date.now(),
            hypothesisId: "H2",
          }),
        }).catch(() => {});
        // #endregion
        throw new Error(typeof errBody?.error === "string" ? errBody.error : "Error");
      }
      onTypesChange();
      const data = await res.json();
      setSelectedTypeId(data.id);
      onSelectType(data.id);
      setNewTypeName("");
    } finally {
      setSaving(false);
    }
  };

  const handleRenameType = async (id: number, name: string) => {
    const res = await fetch(`/api/evaluation-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) onTypesChange();
  };

  const handleDeleteType = async (id: number) => {
    if (!confirm("¿Eliminar este tipo de evaluación?")) return;
    const res = await fetch(`/api/evaluation-types/${id}`, { method: "DELETE" });
    if (res.ok) {
      onTypesChange();
      if (selectedTypeId === id) setSelectedTypeId(types[0]?.id ?? null);
    }
  };

  const handleSavePrompt = async () => {
    if (!selectedTypeId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/config/${selectedTypeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: config.prompt }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadKnowledge = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !selectedTypeId) return;
    const form = new FormData();
    form.set("kind", "knowledge");
    form.set("evaluationTypeId", String(selectedTypeId));
    for (let i = 0; i < files.length; i++) form.append("files", files[i]);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (res.ok) {
      const data = await res.json();
      setConfig((c) => ({ ...c, knowledge_paths: data.knowledge_paths ?? c.knowledge_paths }));
      onTypesChange();
    }
    e.target.value = "";
  };

  const handleUploadRubric = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTypeId) return;
    const form = new FormData();
    form.set("kind", "rubric");
    form.set("evaluationTypeId", String(selectedTypeId));
    form.set("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (res.ok) {
      const data = await res.json();
      setConfig((c) => ({ ...c, rubric_path: data.rubric_path ?? "" }));
      onTypesChange();
    }
    e.target.value = "";
  };

  const knowledgeInputRef = useRef<HTMLInputElement>(null);
  const rubricInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const sectionClass = "rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-600 dark:bg-gray-800/60";
  const sectionTitleClass = "text-sm font-semibold text-gray-800 dark:text-gray-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-7xl flex-col rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#252526]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-600">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Configuración</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            Cerrar
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-6 overflow-auto p-6">
          {/* Columna izquierda: Tipo, Documentos, Rúbrica */}
          <div className="min-w-0 flex flex-col space-y-5 overflow-y-auto">
            <section className={sectionClass}>
              <h3 className={sectionTitleClass}>1. Tipo de evaluación</h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Cree un tipo o seleccione uno existente. La configuración de documentos y rúbrica aplica al tipo seleccionado.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="Nombre del tipo (ej. IGIP, TRL)"
                  className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={handleCreateType}
                  disabled={saving || !newTypeName.trim()}
                  className="rounded bg-[#4b5563] px-4 py-2 text-sm font-medium text-white hover:bg-[#374151] dark:bg-[#6b7280] dark:hover:bg-[#4b5563] disabled:opacity-50"
                >
                  Crear
                </button>
              </div>
              {types.length > 0 && (
                <div className="mt-3">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Seleccionar tipo:</span>
                  <ul className="mt-1 space-y-1">
                    {types.map((t) => (
                      <li key={t.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTypeId(t.id)}
                          className={`flex-1 rounded px-3 py-2 text-left text-sm ${
                            selectedTypeId === t.id
                              ? "bg-gray-300 font-medium dark:bg-gray-600 dark:text-white"
                              : "hover:bg-gray-200 dark:hover:bg-gray-700"
                          }`}
                        >
                          {t.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteType(t.id)}
                          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                        >
                          Eliminar
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {!selectedTypeId ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Seleccione un tipo de la lista anterior o cree uno nuevo para poder cargar documentos, rúbrica y configurar el prompt.
                </p>
              </div>
            ) : (
              <>
                <section className={sectionClass}>
                  <h3 className={sectionTitleClass}>2. Documentos de referencia (Knowledge)</h3>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Aquí se cargan los archivos que el evaluador usará como base de conocimiento. Puede subir varios (PDF, Word, Excel, texto, etc.).
                  </p>
                  <input
                    ref={knowledgeInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.json"
                    className="sr-only"
                    onChange={handleUploadKnowledge}
                  />
                  <button
                    type="button"
                    onClick={() => knowledgeInputRef.current?.click()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white py-4 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700"
                  >
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Subir documentos de referencia
                  </button>
                  {config.knowledge_paths.length > 0 && (
                    <ul className="mt-2 space-y-0.5 rounded bg-gray-100 px-2 py-2 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      <span className="font-medium">Archivos cargados:</span>
                      {config.knowledge_paths.map((p, i) => (
                        <li key={i} className="truncate pl-1">{typeof p === "string" ? p : p.name}</li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className={sectionClass}>
                  <h3 className={sectionTitleClass}>3. Rúbrica de evaluación</h3>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Un único archivo con los criterios y niveles de la rúbrica (PDF, Word, Excel o texto).
                  </p>
                  <input
                    ref={rubricInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md"
                    className="sr-only"
                    onChange={handleUploadRubric}
                  />
                  <button
                    type="button"
                    onClick={() => rubricInputRef.current?.click()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white py-4 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700"
                  >
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {config.rubric_path ? "Cambiar archivo de rúbrica" : "Seleccionar archivo de rúbrica"}
                  </button>
                  {config.rubric_path && (
                    <p className="mt-2 truncate rounded bg-gray-100 px-2 py-1.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {config.rubric_path}
                    </p>
                  )}
                </section>
              </>
            )}
          </div>

          {/* Columna derecha: Prompt */}
          <section className={`${sectionClass} flex min-h-0 min-w-0 flex-col`}>
            <h3 className={sectionTitleClass}>4. Instrucciones e informe (Prompt)</h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Instrucciones para el agente y formato esperado del informe de evaluación.
            </p>
            <textarea
              value={config.prompt}
              onChange={(e) => setConfig((c) => ({ ...c, prompt: e.target.value }))}
              rows={14}
              disabled={!selectedTypeId}
              className="mt-3 min-h-[200px] flex-1 resize-y rounded border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder={selectedTypeId ? "Ej.: Evalúa el proyecto según la rúbrica. Incluye una sección por criterio con nivel y justificación..." : "Seleccione un tipo de evaluación a la izquierda para editar el prompt."}
            />
            <button
              type="button"
              onClick={handleSavePrompt}
              disabled={saving || !selectedTypeId}
              className="mt-2 shrink-0 rounded bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Guardar prompt
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
