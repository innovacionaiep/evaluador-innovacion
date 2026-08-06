"use client";

import { apiFetch } from "@/lib/api-fetch";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatIndicatorScore,
  type RubricScoreSchemaEntry,
} from "@/lib/evaluation-scores";
import {
  generateEvaluationPdfBlob,
  sanitizeFileName,
} from "@/lib/evaluation-pdf";
import { exportHistoryExcel } from "@/lib/bulk-export";
import { parseResponseJson } from "@/lib/fetch-json";
import ReportMarkdownView from "@/components/ReportMarkdownView";
import {
  FIXED_EVAL_TYPE_KEYS,
  fixedKeyFor,
  isTrl,
  type FixedEvalTypeKey,
} from "@/lib/eval-types/constants";

type HistoryListItem = {
  id: number;
  evaluation_type_id: number | null;
  evaluation_type_name: string;
  project_name: string;
  file_name: string;
  subdimension_scores: Record<string, number | null>;
  overall_score: number | null;
  summary: string;
  score_schema: RubricScoreSchemaEntry[];
  created_at: string;
};

type HistoryDetail = HistoryListItem & {
  report_content: string;
};

const CELL_BORDER = "border border-gray-200 dark:border-gray-600";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CL", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatDateOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-CL", { dateStyle: "short" });
  } catch {
    return iso;
  }
}

function asScoreSchema(value: unknown): RubricScoreSchemaEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is RubricScoreSchemaEntry =>
      !!e &&
      typeof e === "object" &&
      typeof (e as RubricScoreSchemaEntry).key === "string" &&
      typeof (e as RubricScoreSchemaEntry).name === "string"
  );
}

/** Une los esquemas de todas las filas (por key) para columnas de la tabla. */
function unionScoreSchema(items: HistoryListItem[]): RubricScoreSchemaEntry[] {
  const byKey = new Map<string, RubricScoreSchemaEntry>();
  for (const item of items) {
    for (const entry of item.score_schema) {
      if (!byKey.has(entry.key)) byKey.set(entry.key, entry);
    }
  }
  return Array.from(byKey.values());
}

function resolveInitialFilter(initialTypeName?: string | null): FixedEvalTypeKey {
  if (initialTypeName?.trim()) return fixedKeyFor(initialTypeName);
  return "IGIP";
}

export default function HistoryPanel({
  isOpen,
  onClose,
  initialTypeName,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Tipo activo del evaluador al abrir el historial (p. ej. TRL). */
  initialTypeName?: string | null;
}) {
  const [typeFilter, setTypeFilter] = useState<FixedEvalTypeKey>(() =>
    resolveInitialFilter(initialTypeName)
  );
  const [items, setItems] = useState<HistoryListItem[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);

  const filteredItems = useMemo(() => {
    const q = projectSearch.trim().toLocaleLowerCase("es");
    if (!q) return items;
    return items.filter((item) =>
      item.project_name.toLocaleLowerCase("es").includes(q)
    );
  }, [items, projectSearch]);

  const checkedCount = useMemo(() => {
    let n = 0;
    for (const item of filteredItems) {
      if (checkedIds.has(item.id)) n += 1;
    }
    return n;
  }, [filteredItems, checkedIds]);

  const allFilteredChecked =
    filteredItems.length > 0 && checkedCount === filteredItems.length;

  const tableSchema = useMemo(() => unionScoreSchema(items), [items]);
  const hideIndicator = isTrl(typeFilter);

  const clearBulkSelection = useCallback(() => {
    setBulkSelectMode(false);
    setCheckedIds(new Set());
  }, []);

  const indicatorLabel = useMemo(() => {
    if (hideIndicator) return "";
    return `Indicador ${typeFilter}`;
  }, [hideIndicator, typeFilter]);

  const scoreLabel = hideIndicator ? "Nivel TRL" : "Nota global";

  const loadList = useCallback(async (type: FixedEvalTypeKey) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100", type });
      const res = await apiFetch(`/api/evaluation-history?${params}`);
      const data = await parseResponseJson<{ error?: string } & HistoryListItem[]>(res);
      if (!res.ok) {
        throw new Error(
          (data && typeof data === "object" && "error" in data && data.error) ||
            `Error ${res.status}`
        );
      }
      const rows = Array.isArray(data) ? data : [];
      setItems(
        rows.map((r: HistoryListItem) => ({
          ...r,
          score_schema: asScoreSchema(r.score_schema),
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setDetail(null);
      setShowReport(false);
      setError(null);
      setEditingId(null);
      setDraftName("");
      setProjectSearch("");
      clearBulkSelection();
      return;
    }
    const next = resolveInitialFilter(initialTypeName);
    setTypeFilter(next);
    setProjectSearch("");
    clearBulkSelection();
    void loadList(next);
  }, [isOpen, initialTypeName, loadList, clearBulkSelection]);

  const selectTypeFilter = (key: FixedEvalTypeKey) => {
    if (key === typeFilter) return;
    setTypeFilter(key);
    setProjectSearch("");
    clearBulkSelection();
    setSelectedId(null);
    setDetail(null);
    setShowReport(false);
    setEditingId(null);
    void loadList(key);
  };

  useEffect(() => {
    if (!isOpen || selectedId == null) {
      setDetail(null);
      setShowReport(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setShowReport(false);
    apiFetch(`/api/evaluation-history/${selectedId}`)
      .then(async (res) => {
        const data = await parseResponseJson<HistoryDetail & { error?: string }>(res);
        if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
        if (cancelled) return;
        setDetail({
          ...data,
          score_schema: asScoreSchema(data.score_schema),
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setDetail(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedId]);

  const handleDownloadPdf = async () => {
    if (!detail?.report_content?.trim()) return;
    setPdfBusy(true);
    try {
      const title = `Informe: ${detail.evaluation_type_name} — ${detail.project_name}`;
      const blob = await generateEvaluationPdfBlob(title, detail.report_content);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFileName(detail.project_name || "informe")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (filteredItems.length === 0) return;
    setExcelBusy(true);
    setError(null);
    try {
      await exportHistoryExcel(
        filteredItems,
        tableSchema,
        indicatorLabel || `Indicador ${typeFilter}`,
        {
          includeIndicator: !hideIndicator,
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExcelBusy(false);
    }
  };

  const handleDelete = async () => {
    if (selectedId == null) return;
    if (!window.confirm("¿Eliminar esta evaluación del historial?")) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/evaluation-history/${selectedId}`, {
        method: "DELETE",
      });
      const data = await parseResponseJson<{ error?: string } | null>(res).catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      setSelectedId(null);
      setDetail(null);
      setEditingId(null);
      setCheckedIds((prev) => {
        if (!prev.has(selectedId)) return prev;
        const next = new Set(prev);
        next.delete(selectedId);
        return next;
      });
      await loadList(typeFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const toggleChecked = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredChecked) {
        for (const item of filteredItems) next.delete(item.id);
      } else {
        for (const item of filteredItems) next.add(item.id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = filteredItems
      .filter((item) => checkedIds.has(item.id))
      .map((item) => item.id);
    if (ids.length === 0) return;
    const label =
      ids.length === 1
        ? "¿Eliminar 1 evaluación del historial?"
        : `¿Eliminar ${ids.length} evaluaciones del historial?`;
    if (!window.confirm(label)) return;
    setDeleting(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await apiFetch(`/api/evaluation-history/${id}`, {
            method: "DELETE",
          });
          const data = await parseResponseJson<{ error?: string } | null>(res).catch(
            () => null
          );
          if (!res.ok) {
            throw new Error(data?.error || `Error ${res.status} al eliminar #${id}`);
          }
          return id;
        })
      );
      const deleted = new Set<number>();
      const failures: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "fulfilled") deleted.add(result.value);
        else {
          const reason =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          failures.push(reason);
        }
      }
      if (selectedId != null && deleted.has(selectedId)) {
        setSelectedId(null);
        setDetail(null);
      }
      setEditingId(null);
      if (failures.length === 0) {
        clearBulkSelection();
      } else {
        setCheckedIds((prev) => {
          const next = new Set(prev);
          for (const id of deleted) next.delete(id);
          return next;
        });
        setError(
          deleted.size > 0
            ? `Se eliminaron ${deleted.size}, pero fallaron ${failures.length}: ${failures[0]}`
            : failures[0] ?? "No se pudieron eliminar las evaluaciones"
        );
      }
      await loadList(typeFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await loadList(typeFilter);
    } finally {
      setDeleting(false);
    }
  };

  const startRename = (item: HistoryListItem) => {
    setEditingId(item.id);
    setDraftName(item.project_name);
    setError(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setDraftName("");
  };

  const saveRename = async (id: number) => {
    const nextName = draftName.trim();
    if (!nextName) {
      setError("El nombre del proyecto no puede estar vacío");
      return;
    }
    const current = items.find((i) => i.id === id);
    if (current && current.project_name === nextName) {
      cancelRename();
      return;
    }
    setRenaming(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/evaluation-history/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: nextName }),
      });
      const data = await parseResponseJson<{ error?: string } | null>(res).catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      setItems((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, project_name: nextName } : row
        )
      );
      setDetail((prev) =>
        prev && prev.id === id ? { ...prev, project_name: nextName } : prev
      );
      cancelRename();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRenaming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-3"
      onClick={onClose}
    >
      <div
        className="flex h-[94vh] w-[98vw] max-w-[1800px] flex-col rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#252526]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-600">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Historial de evaluaciones
            </h2>
            <div
              className="flex items-center gap-1.5"
              role="tablist"
              aria-label="Tipo de evaluación del historial"
            >
              {FIXED_EVAL_TYPE_KEYS.map((key) => {
                const selected = typeFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => selectTypeFilter(key)}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-400 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100 dark:ring-emerald-600"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {key}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadExcel()}
              disabled={excelBusy || loading || filteredItems.length === 0}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-500 dark:text-gray-100 dark:hover:bg-white/10"
            >
              {excelBusy ? "Generando…" : "Descargar Excel"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
            >
              Cerrar
            </button>
          </div>
        </div>

        {error && (
          <div className="shrink-0 border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {/* Tabla de selección (estilo evaluación masiva) */}
          <div className="flex min-w-0 flex-1 flex-col border-r border-gray-200 dark:border-gray-600">
            <div className="shrink-0 space-y-2 border-b border-gray-200 px-4 py-2 dark:border-gray-600">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {bulkSelectMode
                  ? `Historial ${typeFilter} — marca las filas a eliminar`
                  : `Historial ${typeFilter} — haz clic en una fila para ver el detalle`}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  placeholder="Buscar por nombre de proyecto…"
                  aria-label="Buscar por nombre de proyecto"
                  disabled={loading || items.length === 0}
                  className="min-w-[200px] flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-emerald-500 disabled:opacity-50 dark:border-gray-500 dark:bg-[#1e1e1e] dark:text-gray-100 dark:focus:border-emerald-500"
                />
                {!loading && items.length > 0 && projectSearch.trim() && (
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {filteredItems.length} / {items.length}
                  </span>
                )}
                {!bulkSelectMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBulkSelectMode(true);
                      setCheckedIds(new Set());
                      setEditingId(null);
                    }}
                    disabled={loading || filteredItems.length === 0 || deleting}
                    className="shrink-0 rounded border border-white bg-gray-600 px-3 py-1.5 text-sm font-medium text-white transition hover:border-red-600 hover:bg-red-600 disabled:opacity-50 dark:bg-gray-500 dark:hover:border-red-500 dark:hover:bg-red-600"
                  >
                    Eliminar masivo
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-pressed="true"
                      onClick={clearBulkSelection}
                      disabled={deleting}
                      title="Salir del modo eliminar masivo"
                      className="shrink-0 rounded border border-red-600 bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:border-red-700 hover:bg-red-700 disabled:opacity-50"
                    >
                      Eliminar masivo
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkDelete()}
                      disabled={deleting || checkedCount === 0}
                      className="shrink-0 rounded border border-white bg-gray-600 px-3 py-1.5 text-sm font-medium text-white transition hover:border-red-600 hover:bg-red-600 disabled:opacity-50 dark:bg-gray-500 dark:hover:border-red-500 dark:hover:bg-red-600"
                    >
                      {deleting
                        ? "Eliminando…"
                        : checkedCount === 0
                          ? "Eliminar seleccionados"
                          : `Eliminar seleccionados (${checkedCount})`}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              {loading && (
                <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Cargando…</p>
              )}
              {!loading && items.length === 0 && (
                <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                  Aún no hay evaluaciones {typeFilter} en el historial.
                </p>
              )}
              {!loading && items.length > 0 && filteredItems.length === 0 && (
                <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                  No hay proyectos que coincidan con «{projectSearch.trim()}».
                </p>
              )}
              {!loading && filteredItems.length > 0 && (
                <table
                  className="border-collapse text-sm"
                  style={{ tableLayout: "fixed", minWidth: "100%" }}
                >
                  <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-[#2d2d2d]">
                    <tr>
                      {bulkSelectMode && (
                        <th
                          className={`${CELL_BORDER} bg-gray-50 px-2 py-2 text-center dark:bg-[#2d2d2d]`}
                          style={{ width: 40 }}
                        >
                          <input
                            type="checkbox"
                            checked={allFilteredChecked}
                            ref={(el) => {
                              if (el) {
                                el.indeterminate =
                                  checkedCount > 0 && !allFilteredChecked;
                              }
                            }}
                            onChange={toggleAllFiltered}
                            disabled={deleting}
                            aria-label="Seleccionar todas las filas visibles"
                            className="h-3.5 w-3.5 accent-emerald-600"
                          />
                        </th>
                      )}
                      <th
                        className={`${CELL_BORDER} bg-gray-50 px-2 py-2 text-left text-xs font-semibold text-gray-800 dark:bg-[#2d2d2d] dark:text-gray-100`}
                        style={{ width: 64 }}
                      >
                        ID
                      </th>
                      <th
                        className={`${CELL_BORDER} bg-gray-50 px-2 py-2 text-left text-xs font-semibold text-gray-800 dark:bg-[#2d2d2d] dark:text-gray-100`}
                        style={{ width: 400 }}
                      >
                        Nombre de proyecto
                      </th>
                      <th
                        className={`${CELL_BORDER} bg-gray-50 px-2 py-2 text-left text-xs font-semibold text-gray-800 dark:bg-[#2d2d2d] dark:text-gray-100`}
                        style={{ width: 60 }}
                      >
                        Fecha
                      </th>
                      {tableSchema.map((col) => (
                        <th
                          key={col.key}
                          className={`${CELL_BORDER} bg-gray-50 px-1.5 py-2 text-center align-bottom text-[10px] font-semibold leading-tight text-gray-800 dark:bg-[#2d2d2d] dark:text-gray-100`}
                          style={{ width: 96 }}
                          title={`${col.name}${col.dimension ? ` · ${col.dimension}` : ""}${col.weight != null ? ` (${col.weight}%)` : ""}`}
                        >
                          <span className="block whitespace-normal break-words">{col.name}</span>
                        </th>
                      ))}
                      {!hideIndicator && (
                        <th
                          className={`${CELL_BORDER} bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-800 dark:bg-[#2d2d2d] dark:text-gray-100`}
                          style={{ width: 100 }}
                        >
                          {indicatorLabel}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const selected = item.id === selectedId;
                      const checked = checkedIds.has(item.id);
                      return (
                        <tr
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (bulkSelectMode) {
                              if (!deleting) toggleChecked(item.id);
                              return;
                            }
                            setSelectedId(item.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (bulkSelectMode) {
                                if (!deleting) toggleChecked(item.id);
                                return;
                              }
                              setSelectedId(item.id);
                            }
                          }}
                          className={`cursor-pointer transition ${
                            bulkSelectMode && checked
                              ? "bg-red-50 dark:bg-red-950/30"
                              : selected
                                ? "bg-emerald-50 dark:bg-emerald-950/40"
                                : "hover:bg-gray-50 dark:hover:bg-white/5"
                          }`}
                        >
                          {bulkSelectMode && (
                            <td
                              className={`${CELL_BORDER} px-2 py-2 text-center align-top`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={deleting}
                                onChange={() => toggleChecked(item.id)}
                                aria-label={`Seleccionar evaluación ${item.id}`}
                                className="h-3.5 w-3.5 accent-emerald-600"
                              />
                            </td>
                          )}
                          <td
                            className={`${CELL_BORDER} px-2 py-2 align-top text-xs font-medium text-gray-700 dark:text-gray-300`}
                          >
                            {item.id}
                          </td>
                          <td
                            className={`${CELL_BORDER} px-2 py-2 align-top text-xs font-medium text-gray-900 dark:text-gray-100`}
                            title={
                              editingId === item.id ? undefined : item.project_name
                            }
                            onClick={
                              editingId === item.id
                                ? (e) => e.stopPropagation()
                                : undefined
                            }
                          >
                            {editingId === item.id ? (
                              <div className="flex flex-col gap-1.5">
                                <input
                                  type="text"
                                  value={draftName}
                                  autoFocus
                                  disabled={renaming}
                                  onChange={(e) => setDraftName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void saveRename(item.id);
                                    } else if (e.key === "Escape") {
                                      e.preventDefault();
                                      cancelRename();
                                    }
                                  }}
                                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-emerald-500 dark:border-gray-500 dark:bg-[#1e1e1e] dark:text-gray-100"
                                />
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    disabled={renaming}
                                    onClick={() => void saveRename(item.id)}
                                    className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    {renaming ? "Guardando…" : "Guardar"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={renaming}
                                    onClick={cancelRename}
                                    className="rounded border border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-500 dark:text-gray-200 dark:hover:bg-white/10"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="group relative pr-14">
                                <div className="overflow-hidden whitespace-normal break-words">
                                  {item.project_name}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startRename(item);
                                  }}
                                  className="absolute right-0 top-0 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-700 opacity-0 shadow-sm transition hover:bg-gray-50 group-hover:opacity-100 focus:opacity-100 dark:border-gray-500 dark:bg-[#2d2d2d] dark:text-gray-200 dark:hover:bg-white/10"
                                >
                                  Editar
                                </button>
                              </div>
                            )}
                          </td>
                          <td
                            className={`${CELL_BORDER} whitespace-nowrap px-2 py-2 align-top text-xs text-gray-600 dark:text-gray-400`}
                          >
                            {formatDateOnly(item.created_at)}
                          </td>
                          {tableSchema.map((col) => {
                            const score =
                              item.subdimension_scores[col.key] ??
                              (hideIndicator ? item.overall_score : null);
                            return (
                              <td
                                key={col.key}
                                className={`${CELL_BORDER} px-2 py-2 text-center align-top text-xs font-medium text-gray-900 dark:text-gray-100`}
                              >
                                {score != null ? formatIndicatorScore(score) : "—"}
                              </td>
                            );
                          })}
                          {!hideIndicator && (
                            <td
                              className={`${CELL_BORDER} px-2 py-2 text-center align-top text-xs font-semibold text-gray-900 dark:text-gray-100`}
                            >
                              {item.overall_score != null
                                ? formatIndicatorScore(item.overall_score)
                                : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Detalle / informe */}
          <div className="flex min-w-0 flex-1 flex-col">
            {selectedId == null ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-gray-500 dark:text-gray-400">
                Selecciona una fila para ver el informe.
              </div>
            ) : detailLoading ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-gray-500 dark:text-gray-400">
                Cargando detalle…
              </div>
            ) : !detail ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-gray-500 dark:text-gray-400">
                No se pudo cargar el detalle.
              </div>
            ) : (
              <>
                <div className="shrink-0 space-y-1 border-b border-gray-200 px-5 py-4 dark:border-gray-600">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {detail.project_name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {detail.evaluation_type_name} · {formatDate(detail.created_at)}
                    {detail.file_name ? ` · ${detail.file_name}` : ""}
                  </p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {scoreLabel}:{" "}
                    {detail.overall_score != null
                      ? formatIndicatorScore(detail.overall_score)
                      : "—"}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowReport((v) => !v)}
                      className="rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600"
                    >
                      {showReport ? "Ocultar informe" : "Ver informe"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownloadPdf()}
                      disabled={pdfBusy || !detail.report_content.trim()}
                      className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-500 dark:text-gray-100 dark:hover:bg-white/10"
                    >
                      {pdfBusy ? "Generando PDF…" : "Descargar informe en PDF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                      className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      {deleting ? "Eliminando…" : "Eliminar"}
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {showReport ? (
                    <ReportMarkdownView content={detail.report_content} />
                  ) : detail.summary?.trim() ? (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Resumen
                      </h4>
                      <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                        {detail.summary}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Pulsa «Ver informe» para leer el informe completo.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
