"use client";

import type { EvaluationConfig } from "@/lib/evaluation-config";
import {
  normalizeRagIncludeDocNames,
  normalizeRagIncludeDocNamesBySubdimension,
} from "@/lib/evaluation-config";
import type { RubricConfig } from "@/lib/rubric-config";
import type { ReportFormatConfig } from "@/lib/report-format-config";
import { knowledgePathItemLabel } from "@/lib/extract-stream";
import type { KnowledgePathItem } from "@/lib/knowledge-config";
import { subdimensionScoreKey } from "@/lib/evaluation-scores";
import { hasRubricVariables, variableLevelKey } from "@/lib/rubric-niveles";
import { inputClass, useEvaluationConfigHelpers } from "./evaluation-config-shared";

type KnowledgeItem = string | { name: string; url: string };

type SubRow = { key: string; dimension: string; name: string };

function knowledgeItemLabel(item: KnowledgeItem): string {
  return knowledgePathItemLabel(item as KnowledgePathItem);
}

function listSubRows(rubric: RubricConfig): SubRow[] {
  if (rubric.type === "ponderaciones") {
    const rows: SubRow[] = [];
    for (const dim of rubric.dimensions) {
      for (const sub of dim.subdimensions) {
        rows.push({
          key: subdimensionScoreKey(dim.name, sub.name),
          dimension: dim.name,
          name: sub.name,
        });
      }
    }
    return rows;
  }
  if (hasRubricVariables(rubric)) {
    return rubric.variables.map((v) => ({
      key: variableLevelKey(v.name),
      dimension: "Variables",
      name: v.name,
    }));
  }
  return [
    {
      key: "nivel-global",
      dimension: "Nivel global",
      name: "Asignación de nivel",
    },
  ];
}

function DocCheckList({
  docLabels,
  selected,
  onToggle,
  onSelectAll,
}: {
  docLabels: string[];
  selected: string[] | undefined;
  onToggle: (name: string, checked: boolean) => void;
  onSelectAll: () => void;
}) {
  const allSelected = !selected;
  const selectedSet = selected ? new Set(selected) : null;
  return (
    <div>
      {docLabels.length > 0 && (
        <button
          type="button"
          className="mb-1 text-[10px] text-accent underline decoration-dotted"
          onClick={onSelectAll}
        >
          Seleccionar todos
        </button>
      )}
      {docLabels.length === 0 ? (
        <p className="text-[10px] text-gray-500">
          No hay documentos en Knowledge para este tipo.
        </p>
      ) : (
        <ul className="max-h-36 space-y-1 overflow-y-auto">
          {docLabels.map((name) => {
            const checked = allSelected || (selectedSet?.has(name) ?? false);
            return (
              <li key={name}>
                <label className="flex cursor-pointer items-start gap-1.5 text-[11px] text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={(e) => onToggle(name, e.target.checked)}
                  />
                  <span className="min-w-0 break-words">{name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function EvaluationRagFields({
  evaluation,
  rubric,
  reportFormat,
  onChange,
  knowledgePaths = [],
}: {
  evaluation: EvaluationConfig;
  rubric: RubricConfig;
  reportFormat: ReportFormatConfig;
  onChange: (e: EvaluationConfig) => void;
  knowledgePaths?: KnowledgeItem[];
}) {
  const { set } = useEvaluationConfigHelpers({ evaluation, rubric, reportFormat, onChange });
  const docLabels = knowledgePaths.map(knowledgeItemLabel).filter((n) => n.trim());
  const selected = normalizeRagIncludeDocNames(evaluation.ragEvaluate.includeDocNames);
  const bySub = evaluation.ragEvaluate.includeDocNamesBySubdimension ?? {};
  const subRows = listSubRows(rubric);

  const patchRag = (patch: Partial<EvaluationConfig["ragEvaluate"]>) => {
    set("ragEvaluate", { ...evaluation.ragEvaluate, ...patch });
  };

  const setIncludeDocNames = (next: string[] | undefined) => {
    patchRag({ includeDocNames: normalizeRagIncludeDocNames(next) });
  };

  const toggleGlobalDoc = (name: string, checked: boolean) => {
    const current = selected ? new Set(selected) : new Set(docLabels);
    if (checked) current.add(name);
    else current.delete(name);
    if (current.size === 0 || current.size === docLabels.length) {
      setIncludeDocNames(undefined);
      return;
    }
    setIncludeDocNames([...current]);
  };

  const setBySubMap = (next: Record<string, string[]> | undefined) => {
    patchRag({
      includeDocNamesBySubdimension: normalizeRagIncludeDocNamesBySubdimension(next),
    });
  };

  const setSubCustom = (key: string, enabled: boolean) => {
    const next = { ...bySub };
    if (!enabled) {
      delete next[key];
      setBySubMap(Object.keys(next).length ? next : undefined);
      return;
    }
    // Al personalizar: partir del global resuelto (o todos).
    next[key] = selected ? [...selected] : [];
    setBySubMap(next);
  };

  const toggleSubDoc = (key: string, name: string, checked: boolean) => {
    const currentList = Object.prototype.hasOwnProperty.call(bySub, key)
      ? bySub[key]
      : selected
        ? [...selected]
        : [];
    const current =
      currentList.length === 0 && !Object.prototype.hasOwnProperty.call(bySub, key)
        ? new Set(docLabels)
        : currentList.length === 0
          ? new Set(docLabels)
          : new Set(currentList);
    // Si override es [] (= todos), current should be all labels
    const base =
      Object.prototype.hasOwnProperty.call(bySub, key) && bySub[key].length === 0
        ? new Set(docLabels)
        : current;

    if (checked) base.add(name);
    else base.delete(name);

    const next = { ...bySub };
    if (base.size === 0 || base.size === docLabels.length) {
      next[key] = []; // todos para esta sub
    } else {
      next[key] = [...base];
    }
    setBySubMap(next);
  };

  const grouped = new Map<string, SubRow[]>();
  for (const row of subRows) {
    const list = grouped.get(row.dimension) ?? [];
    list.push(row);
    grouped.set(row.dimension, list);
  }

  return (
    <div className="space-y-2">
      <label>
        <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">
          Elementos proyecto en RAG
        </span>
        <input
          type="number"
          className={inputClass}
          min={1}
          max={50}
          value={evaluation.projectElementsInRagQuery}
          onChange={(e) => set("projectElementsInRagQuery", Number(e.target.value))}
        />
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        <label>
          <span className="mb-0.5 block text-[10px] text-gray-500">RAG topK</span>
          <span className="mb-0.5 block text-[9px] leading-snug text-gray-400">
            Máx. fragmentos recuperados del Knowledge
          </span>
          <input
            type="number"
            className={inputClass}
            value={evaluation.ragEvaluate.topK ?? ""}
            onChange={(e) =>
              patchRag({
                topK: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          <span className="mb-0.5 block text-[10px] text-gray-500">RAG max chars</span>
          <span className="mb-0.5 block text-[9px] leading-snug text-gray-400">
            Tope de caracteres solo de los fragmentos RAG
          </span>
          <input
            type="number"
            className={inputClass}
            value={evaluation.ragEvaluate.maxRetrievedChars ?? ""}
            onChange={(e) =>
              patchRag({
                maxRetrievedChars: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          <span className="mb-0.5 block text-[10px] text-gray-500">System max chars</span>
          <span className="mb-0.5 block text-[9px] leading-snug text-gray-400">
            Tope del system message ensamblado completo
          </span>
          <input
            type="number"
            className={inputClass}
            value={evaluation.ragEvaluate.maxSystemChars ?? ""}
            onChange={(e) =>
              patchRag({
                maxSystemChars: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
      </div>

      <div className="rounded border border-gray-200 bg-white/60 p-2 dark:border-gray-600 dark:bg-gray-900/40">
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
          Por defecto (todas las subdimensiones)
        </span>
        <p className="mb-1.5 text-[9px] leading-snug text-gray-400">
          Documentos usados si no personalizas una subdimensión. El chat y el índice no cambian. Si
          desmarcas todos, se usan todos.
        </p>
        <DocCheckList
          docLabels={docLabels}
          selected={selected}
          onToggle={toggleGlobalDoc}
          onSelectAll={() => setIncludeDocNames(undefined)}
        />
        {selected && (
          <p className="mt-1.5 text-[9px] text-amber-700 dark:text-amber-400">
            Filtrado global: {selected.length} de {docLabels.length} documento(s).
          </p>
        )}
      </div>

      <div className="rounded border border-gray-200 bg-white/60 p-2 dark:border-gray-600 dark:bg-gray-900/40">
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
          Por subdimensión
        </span>
        <p className="mb-1.5 text-[9px] leading-snug text-gray-400">
          Si no personalizas, se usan los documentos del bloque «Por defecto».
        </p>
        {subRows.length === 0 ? (
          <p className="text-[10px] text-gray-500">No hay subdimensiones en la rúbrica.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {[...grouped.entries()].map(([dimension, rows]) => (
              <div key={dimension}>
                <p className="mb-1 text-[10px] font-medium text-gray-600 dark:text-gray-400">
                  {dimension}
                </p>
                <ul className="space-y-1.5">
                  {rows.map((row) => {
                    const customized = Object.prototype.hasOwnProperty.call(bySub, row.key);
                    const subSelected = customized
                      ? bySub[row.key].length === 0
                        ? undefined
                        : bySub[row.key]
                      : undefined;
                    return (
                      <li
                        key={row.key}
                        className="rounded border border-gray-100 bg-gray-50/80 p-1.5 dark:border-gray-700 dark:bg-gray-900/50"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-[11px] text-gray-800 dark:text-gray-200">
                            {row.name}
                          </span>
                          <label className="flex cursor-pointer items-center gap-1 text-[10px] text-gray-500">
                            <input
                              type="checkbox"
                              checked={customized}
                              onChange={(e) => setSubCustom(row.key, e.target.checked)}
                            />
                            Personalizar
                          </label>
                        </div>
                        {customized && (
                          <div className="mt-1.5 border-t border-gray-100 pt-1.5 dark:border-gray-700">
                            <DocCheckList
                              docLabels={docLabels}
                              selected={subSelected}
                              onToggle={(name, checked) => toggleSubDoc(row.key, name, checked)}
                              onSelectAll={() => {
                                const next = { ...bySub, [row.key]: [] };
                                setBySubMap(next);
                              }}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
