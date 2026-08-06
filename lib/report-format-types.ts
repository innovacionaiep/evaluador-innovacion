/** Shared report-format types and section id helpers. */

export type ReportSectionKind =
  | "custom"
  | "dimension_overview"
  | "subdimension_eval"
  | "variable_eval"
  | "assigned_level"
  | "trl_eval"
  | "trl_level";

/** Sección expandida para runtime (prompt de formateo, límites de evaluación). */
export type ReportSection = {
  id: string;
  title: string;
  description: string;
  minChars: number;
  maxChars: number;
  kind: ReportSectionKind;
  dimensionId?: string;
  subdimensionId?: string;
  variableId?: string;
  locked?: boolean;
};

export type ReportCustomSection = {
  id: string;
  title: string;
  description: string;
  minChars: number;
  maxChars: number;
};

export type ReportFormatConfig = {
  /** Secciones libres al inicio del informe (no vienen predefinidas). */
  preamble: ReportCustomSection[];
  /** Instrucciones generales para todas las dimensiones. */
  dimensionOverviewInstructions: string;
  /** Instrucciones generales para todas las subdimensiones. */
  subdimensionEvalInstructions: string;
  /** Límites de caracteres aplicados a cada dimensión. */
  dimensionOverviewLimits: { minChars: number; maxChars: number };
  /** Límites de caracteres aplicados a cada subdimensión. */
  subdimensionEvalLimits: { minChars: number; maxChars: number };
  /** Secciones libres antes del cierre del informe (p. ej. síntesis final). */
  beforeScores: ReportCustomSection[];
  /** Solo rúbrica niveles: instrucciones y límites del nivel asignado. */
  assignedLevelInstructions?: string;
  assignedLevelLimits?: { minChars: number; maxChars: number };
};

export function newReportSectionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function dimensionOverviewId(dimensionId: string): string {
  return `dim_overview_${dimensionId}`;
}

export function subdimensionEvalId(subdimensionId: string): string {
  return `sub_eval_${subdimensionId}`;
}

export function variableEvalId(variableId: string): string {
  return `var_eval_${variableId}`;
}

export const ASSIGNED_LEVEL_ID = "assigned_level";
export const TRL_EVAL_ID = "trl_eval";
export const TRL_LEVEL_ID = "trl_level";

export const DEFAULT_SUBDIMENSION_EVAL_INSTRUCTIONS = `Incluye obligatoriamente en esta subdimensión:
1. **Análisis** — evaluación según el proyecto y los criterios de la rúbrica.
2. **Nota** — línea exacta «Nota: N» con la nota asignada según la escala de la rúbrica.
3. **Justificación** — fundamentada en el Knowledge (marco teórico de referencia).
4. **Sugerencias de mejora** — propuestas concretas para mejorar el proyecto en este criterio.`;

export const DEFAULT_DIMENSION_OVERVIEW_INSTRUCTIONS =
  "Resumen macro de la dimensión en conjunto, sintetizando las evaluaciones de sus subdimensiones. Integra hallazgos transversales y conclusión global de la dimensión. No re-evalúes criterios ni asignes notas.";

export const DEFAULT_ASSIGNED_LEVEL_INSTRUCTIONS =
  "Nivel global asignado, síntesis de las evaluaciones por variable y justificación fundamentada en el Knowledge.";

export const DEFAULT_VARIABLE_EVAL_INSTRUCTIONS = `Incluye obligatoriamente en esta variable:
1. **Análisis** — evaluación técnica exhaustiva según los criterios de la perspectiva.
2. **Nivel asignado** — línea exacta «Nivel: N» con el nivel de esta variable.
3. **Justificación** — fundamentada en el Knowledge y la evidencia del proyecto.`;

export const DEFAULT_TRL_EVAL_INSTRUCTIONS = `Incluye obligatoriamente:
1. **Análisis** — evaluación según los criterios de los niveles TRL.
2. **Nivel** — línea exacta «Nivel: N».
3. **Justificación** — fundamentada en el Knowledge.
4. **Sugerencias de mejora** — propuestas para avanzar de nivel.`;

export function defaultInstructionForSectionKind(kind: ReportSectionKind): string {
  switch (kind) {
    case "dimension_overview":
      return DEFAULT_DIMENSION_OVERVIEW_INSTRUCTIONS;
    case "subdimension_eval":
      return DEFAULT_SUBDIMENSION_EVAL_INSTRUCTIONS;
    case "variable_eval":
      return DEFAULT_VARIABLE_EVAL_INSTRUCTIONS;
    case "assigned_level":
      return DEFAULT_ASSIGNED_LEVEL_INSTRUCTIONS;
    case "trl_eval":
      return DEFAULT_TRL_EVAL_INSTRUCTIONS;
    case "trl_level":
      return "Bloque autoritativo con el Nivel TRL asignado (generado automáticamente).";
    default:
      return "";
  }
}

export const DEFAULT_DIM_OVERVIEW_LIMITS = { minChars: 350, maxChars: 700 };
export const DEFAULT_SUB_EVAL_LIMITS = { minChars: 1200, maxChars: 1500 };
export const DEFAULT_ASSIGNED_LEVEL_LIMITS = { minChars: 1500, maxChars: 2000 };
export const DEFAULT_TRL_EVAL_LIMITS = { minChars: 1200, maxChars: 2500 };
