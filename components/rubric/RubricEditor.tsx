"use client";

import { useState } from "react";
import type {
  RubricConfig,
  RubricConfigNiveles,
  RubricConfigPonderaciones,
  RubricConfigTrl,
  RubricDimensionConfig,
  RubricLevelConfig,
  RubricSubdimensionConfig,
  RubricVariableConfig,
} from "@/lib/rubric-config";
import {
  newRubricId,
  totalWeightPercent,
} from "@/lib/rubric-config";

const inputClass =
  "w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";
const btnClass =
  "rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700";

function modalityLabel(type: RubricConfig["type"]): string {
  if (type === "ponderaciones") return "Ponderaciones (IGIP)";
  if (type === "trl") return "Niveles TRL";
  return "Variables y subniveles (IMET)";
}

export default function RubricEditor({
  value,
  onChange,
}: {
  value: RubricConfig;
  onChange: (v: RubricConfig) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
        Modalidad fija:{" "}
        <span className="font-medium text-gray-700 dark:text-gray-200">
          {modalityLabel(value.type)}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {value.type === "ponderaciones" ? (
          <PonderacionesEditor
            value={value}
            onChange={onChange as (v: RubricConfigPonderaciones) => void}
          />
        ) : value.type === "trl" ? (
          <TrlLevelsEditor value={value} onChange={onChange as (v: RubricConfigTrl) => void} />
        ) : (
          <NivelesEditor value={value} onChange={onChange as (v: RubricConfigNiveles) => void} />
        )}
      </div>
    </div>
  );
}

function TrlLevelsEditor({
  value,
  onChange,
}: {
  value: RubricConfigTrl;
  onChange: (v: RubricConfigTrl) => void;
}) {
  const updateLevel = (idx: number, level: RubricLevelConfig) => {
    const levels = [...value.levels];
    levels[idx] = level;
    onChange({ ...value, levels });
  };

  const addLevel = () => {
    const nextLevel =
      value.levels.length === 0 ? 1 : Math.max(...value.levels.map((l) => l.level)) + 1;
    onChange({
      ...value,
      levels: [
        ...value.levels,
        {
          id: newRubricId(),
          level: nextLevel,
          title: `Nivel ${nextLevel}`,
          description: "",
        },
      ],
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Niveles TRL
          </span>
          <p className="text-[10px] text-gray-500">
            Define los niveles de madurez. La evaluación asigna un único nivel al proyecto.
            {value.levels.length === 0
              ? " Lista vacía: agrega al menos un nivel antes de evaluar."
              : ""}
          </p>
        </div>
        <button type="button" className={btnClass} onClick={addLevel}>
          + Nivel
        </button>
      </div>

      {value.levels.length === 0 && (
        <p className="rounded border border-amber-300/60 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
          Sin niveles configurados. Carga aquí la escala TRL que usarás en la evaluación.
        </p>
      )}

      {value.levels.map((lvl, i) => (
        <div
          key={lvl.id}
          className="rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900/40"
        >
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <input
              type="number"
              className={`${inputClass} w-14`}
              value={lvl.level}
              onChange={(e) => updateLevel(i, { ...lvl, level: Number(e.target.value) })}
              title="Número de nivel"
            />
            <input
              className={`${inputClass} flex-1 font-medium`}
              value={lvl.title}
              onChange={(e) => updateLevel(i, { ...lvl, title: e.target.value })}
              placeholder="Título del nivel"
            />
            <button
              type="button"
              className={`${btnClass} text-red-600`}
              onClick={() =>
                onChange({
                  ...value,
                  levels: value.levels.filter((_, j) => j !== i),
                })
              }
            >
              Eliminar
            </button>
          </div>
          <textarea
            className={`${inputClass} min-h-[56px] resize-y`}
            value={lvl.description}
            onChange={(e) => updateLevel(i, { ...lvl, description: e.target.value })}
            placeholder="Criterios / descripción del nivel"
          />
        </div>
      ))}
    </div>
  );
}

function PonderacionesEditor({
  value,
  onChange,
}: {
  value: RubricConfigPonderaciones;
  onChange: (v: RubricConfigPonderaciones) => void;
}) {
  const weightSum = totalWeightPercent(value);
  const weightOk = weightSum === 100;

  const setScale = (min: number, max: number) => {
    const m = Math.max(1, Math.min(10, min));
    const M = Math.max(m, Math.min(10, max));
    const dimensions = value.dimensions.map((d) => ({
      ...d,
      subdimensions: d.subdimensions.map((s) => ({
        ...s,
        scores: Array.from({ length: M - m + 1 }, (_, i) => {
          const v = m + i;
          const prev = s.scores.find((sc) => sc.value === v);
          return { value: v, description: prev?.description ?? `Nota ${v}` };
        }),
      })),
    }));
    onChange({ ...value, scoreScale: { min: m, max: M }, dimensions });
  };

  const updateDim = (idx: number, dim: RubricDimensionConfig) => {
    const dimensions = [...value.dimensions];
    dimensions[idx] = dim;
    onChange({ ...value, dimensions });
  };

  const addDimension = () => {
    onChange({
      ...value,
      dimensions: [
        ...value.dimensions,
        { id: newRubricId(), name: "Nueva dimensión", subdimensions: [] },
      ],
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-0.5 block text-[10px] uppercase text-gray-500">Escala mín.</span>
          <input
            type="number"
            className={`${inputClass} w-16`}
            value={value.scoreScale.min}
            onChange={(e) => setScale(Number(e.target.value), value.scoreScale.max)}
          />
        </label>
        <label className="text-xs">
          <span className="mb-0.5 block text-[10px] uppercase text-gray-500">Escala máx.</span>
          <input
            type="number"
            className={`${inputClass} w-16`}
            value={value.scoreScale.max}
            onChange={(e) => setScale(value.scoreScale.min, Number(e.target.value))}
          />
        </label>
        <span
          className={`text-xs ${weightOk ? "text-green-600" : "text-amber-600 dark:text-amber-400"}`}
        >
          Peso total: {weightSum}% {weightOk ? "✓" : "(debe ser 100%)"}
        </span>
        <button type="button" className={btnClass} onClick={addDimension}>
          + Dimensión
        </button>
      </div>
      {value.dimensions.map((dim, di) => (
        <DimensionBlock
          key={dim.id}
          dim={dim}
          scale={value.scoreScale}
          onChange={(d) => updateDim(di, d)}
          onRemove={() =>
            onChange({ ...value, dimensions: value.dimensions.filter((_, i) => i !== di) })
          }
          onMoveUp={di > 0 ? () => {
            const dims = [...value.dimensions];
            [dims[di - 1], dims[di]] = [dims[di], dims[di - 1]];
            onChange({ ...value, dimensions: dims });
          } : undefined}
          onMoveDown={
            di < value.dimensions.length - 1
              ? () => {
                  const dims = [...value.dimensions];
                  [dims[di], dims[di + 1]] = [dims[di + 1], dims[di]];
                  onChange({ ...value, dimensions: dims });
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function DimensionBlock({
  dim,
  scale,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  dim: RubricDimensionConfig;
  scale: { min: number; max: number };
  onChange: (d: RubricDimensionConfig) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const updateSub = (idx: number, sub: RubricSubdimensionConfig) => {
    const subdimensions = [...dim.subdimensions];
    subdimensions[idx] = sub;
    onChange({ ...dim, subdimensions });
  };

  return (
    <div className="rounded border border-gray-200 p-2 dark:border-gray-700">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {onMoveUp && (
          <button type="button" className={btnClass} onClick={onMoveUp} aria-label="Subir">
            ↑
          </button>
        )}
        {onMoveDown && (
          <button type="button" className={btnClass} onClick={onMoveDown} aria-label="Bajar">
            ↓
          </button>
        )}
        <input
          className={`${inputClass} flex-1 font-medium`}
          value={dim.name}
          onChange={(e) => onChange({ ...dim, name: e.target.value })}
        />
        <button type="button" className={`${btnClass} text-red-600`} onClick={onRemove}>
          Eliminar
        </button>
      </div>
      {dim.subdimensions.map((sub, si) => (
        <SubdimensionBlock
          key={sub.id}
          sub={sub}
          scale={scale}
          onChange={(s) => updateSub(si, s)}
          onRemove={() =>
            onChange({ ...dim, subdimensions: dim.subdimensions.filter((_, i) => i !== si) })
          }
        />
      ))}
      <button
        type="button"
        className={`${btnClass} mt-1`}
        onClick={() =>
          onChange({
            ...dim,
            subdimensions: [
              ...dim.subdimensions,
              {
                id: newRubricId(),
                name: "Nueva subdimensión",
                weightPercent: 0,
                scores: Array.from({ length: scale.max - scale.min + 1 }, (_, i) => ({
                  value: scale.min + i,
                  description: `Nota ${scale.min + i}`,
                })),
              },
            ],
          })
        }
      >
        + Subdimensión
      </button>
    </div>
  );
}

function SubdimensionBlock({
  sub,
  scale,
  onChange,
  onRemove,
}: {
  sub: RubricSubdimensionConfig;
  scale: { min: number; max: number };
  onChange: (s: RubricSubdimensionConfig) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mb-2 ml-2 border-l-2 border-gray-200 pl-2 dark:border-gray-600">
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <input
          className={`${inputClass} flex-1`}
          value={sub.name}
          onChange={(e) => onChange({ ...sub, name: e.target.value })}
        />
        <label className="flex items-center gap-1 text-xs">
          <span className="text-gray-500">%</span>
          <input
            type="number"
            className={`${inputClass} w-14`}
            value={sub.weightPercent}
            onChange={(e) => onChange({ ...sub, weightPercent: Number(e.target.value) })}
          />
        </label>
        <button type="button" className={`${btnClass} text-red-600`} onClick={onRemove}>
          ×
        </button>
      </div>
      <div className="space-y-1">
        {sub.scores.map((sc, i) => (
          <div key={sc.value} className="flex gap-1 text-xs">
            <span className="w-8 shrink-0 pt-1 text-gray-500">{sc.value}</span>
            <input
              className={inputClass}
              value={sc.description}
              onChange={(e) => {
                const scores = [...sub.scores];
                scores[i] = { ...sc, description: e.target.value };
                onChange({ ...sub, scores });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function NivelesEditor({
  value,
  onChange,
}: {
  value: RubricConfigNiveles;
  onChange: (v: RubricConfigNiveles) => void;
}) {
  const [mainOpen, setMainOpen] = useState(false);
  const [openVars, setOpenVars] = useState<Record<string, boolean>>({});

  const updateVariable = (idx: number, variable: RubricVariableConfig) => {
    const variables = [...value.variables];
    variables[idx] = variable;
    onChange({ ...value, variables });
  };

  const setLevels = (levels: RubricLevelConfig[]) => {
    onChange({ ...value, levels });
  };

  const updateLevel = (idx: number, level: RubricLevelConfig) => {
    const levels = [...value.levels];
    levels[idx] = level;
    setLevels(levels);
  };

  const addVariableLevel = (vi: number) => {
    const variable = value.variables[vi];
    const nextLevel =
      variable.levels.length === 0
        ? 1
        : Math.max(...variable.levels.map((l) => l.level)) + 1;
    updateVariable(vi, {
      ...variable,
      levels: [
        ...variable.levels,
        { level: nextLevel, title: `Nivel ${nextLevel}`, description: "" },
      ],
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Variables y subniveles
            </span>
            <p className="text-[10px] text-gray-500">
              La evaluación asigna un subnivel por variable. El índice IMET es el promedio simple
              (2 decimales).
            </p>
          </div>
          <button
            type="button"
            className={btnClass}
            onClick={() =>
              onChange({
                ...value,
                variables: [
                  ...value.variables,
                  {
                    id: newRubricId(),
                    name: `Variable ${value.variables.length + 1}`,
                    levels: [
                      { level: 1, title: "Exploración", description: "" },
                      { level: 2, title: "Oportunidad formulada", description: "" },
                      { level: 3, title: "Estructurado", description: "" },
                      { level: 4, title: "Validado", description: "" },
                      { level: 5, title: "Validado comercialmente", description: "" },
                    ],
                  },
                ],
              })
            }
          >
            + Variable
          </button>
        </div>

        {value.variables.map((variable, vi) => {
          const isOpen = openVars[variable.id] ?? true;
          return (
            <div
              key={variable.id}
              className="rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900/40"
            >
              <div className="mb-1 flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                  onClick={() =>
                    setOpenVars((prev) => ({ ...prev, [variable.id]: !isOpen }))
                  }
                  aria-expanded={isOpen}
                >
                  {isOpen ? "▼" : "▶"}
                </button>
                <input
                  className={`${inputClass} flex-1 font-medium`}
                  value={variable.name}
                  onChange={(e) => updateVariable(vi, { ...variable, name: e.target.value })}
                  placeholder="Nombre de la variable"
                />
                <button
                  type="button"
                  className={`${btnClass} text-red-600`}
                  onClick={() =>
                    onChange({
                      ...value,
                      variables: value.variables.filter((_, j) => j !== vi),
                    })
                  }
                >
                  Eliminar
                </button>
              </div>

              {isOpen && (
                <div className="mt-2 space-y-2">
                  {variable.levels.map((vl, li) => (
                    <div
                      key={`${variable.id}-lvl-${vl.level}-${li}`}
                      className="border-l-2 border-emerald-500/40 pl-2"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-1">
                        <input
                          type="number"
                          className={`${inputClass} w-14`}
                          value={vl.level}
                          onChange={(e) => {
                            const levels = [...variable.levels];
                            levels[li] = { ...vl, level: Number(e.target.value) };
                            updateVariable(vi, { ...variable, levels });
                          }}
                          title="Número de subnivel"
                        />
                        <input
                          className={`${inputClass} flex-1`}
                          value={vl.title}
                          onChange={(e) => {
                            const levels = [...variable.levels];
                            levels[li] = { ...vl, title: e.target.value };
                            updateVariable(vi, { ...variable, levels });
                          }}
                          placeholder="Título del subnivel"
                        />
                        <button
                          type="button"
                          className={`${btnClass} text-red-600`}
                          onClick={() =>
                            updateVariable(vi, {
                              ...variable,
                              levels: variable.levels.filter((_, j) => j !== li),
                            })
                          }
                        >
                          Eliminar
                        </button>
                      </div>
                      <textarea
                        className={`${inputClass} min-h-[48px] resize-y`}
                        value={vl.description}
                        onChange={(e) => {
                          const levels = [...variable.levels];
                          levels[li] = { ...vl, description: e.target.value };
                          updateVariable(vi, { ...variable, levels });
                        }}
                        placeholder="Criterio de esta variable para el subnivel"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => addVariableLevel(vi)}
                  >
                    + Subnivel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
        <button
          type="button"
          className="mb-2 flex w-full items-center justify-between text-left text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          onClick={() => setMainOpen((o) => !o)}
        >
          <span>
            Niveles principales{" "}
            <span className="font-normal opacity-80">(referencia visual, no usan en la evaluación)</span>
          </span>
          <span>{mainOpen ? "▼" : "▶"}</span>
        </button>

        {mainOpen && (
          <div className="space-y-2 opacity-75">
            <div className="flex justify-end">
              <button
                type="button"
                className={btnClass}
                onClick={() => {
                  const nextLevel =
                    value.levels.length === 0
                      ? 1
                      : Math.max(...value.levels.map((l) => l.level)) + 1;
                  setLevels([
                    ...value.levels,
                    {
                      id: newRubricId(),
                      level: nextLevel,
                      title: `Nivel ${nextLevel}`,
                      description: "",
                    },
                  ]);
                }}
              >
                + Nivel
              </button>
            </div>
            {value.levels.map((lvl, i) => (
              <div
                key={lvl.id}
                className="rounded border border-dashed border-gray-300 p-2 dark:border-gray-600"
              >
                <div className="mb-1 flex flex-wrap gap-1">
                  <input
                    type="number"
                    className={`${inputClass} w-14`}
                    value={lvl.level}
                    onChange={(e) => updateLevel(i, { ...lvl, level: Number(e.target.value) })}
                  />
                  <input
                    className={`${inputClass} flex-1`}
                    value={lvl.title}
                    onChange={(e) => updateLevel(i, { ...lvl, title: e.target.value })}
                    placeholder="Título"
                  />
                  <button
                    type="button"
                    className={`${btnClass} text-red-600`}
                    onClick={() => setLevels(value.levels.filter((_, j) => j !== i))}
                  >
                    Eliminar
                  </button>
                </div>
                <textarea
                  className={`${inputClass} min-h-[40px] resize-y`}
                  value={lvl.description}
                  onChange={(e) => updateLevel(i, { ...lvl, description: e.target.value })}
                  placeholder="Descripción de referencia"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
