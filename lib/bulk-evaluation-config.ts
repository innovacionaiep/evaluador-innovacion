export type BulkEvaluationConfig = {
  parallelProjects: number;
  /** Tope global de llamadas LLM simultáneas (semáforo compartido). */
  maxConcurrentLlm: number;
  useClientKnowledgeIndex: boolean;
  preloadKnowledgeOnBulkStart: boolean;
};

export const BULK_EVALUATION_CONFIG_KEY = "bulk_evaluation_config";

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(value ?? fallback);
  return Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : fallback));
};

export function defaultBulkEvaluationConfig(): BulkEvaluationConfig {
  return {
    parallelProjects: 2,
    maxConcurrentLlm: 5,
    useClientKnowledgeIndex: true,
    preloadKnowledgeOnBulkStart: true,
  };
}

export function mergeBulkEvaluationConfig(
  raw?: Partial<BulkEvaluationConfig> | null
): BulkEvaluationConfig {
  const base = defaultBulkEvaluationConfig();
  if (!raw || typeof raw !== "object") return base;

  return {
    parallelProjects: clampInt(raw.parallelProjects, base.parallelProjects, 1, 10),
    maxConcurrentLlm: clampInt(raw.maxConcurrentLlm, base.maxConcurrentLlm, 1, 10),
    useClientKnowledgeIndex: raw.useClientKnowledgeIndex ?? base.useClientKnowledgeIndex,
    preloadKnowledgeOnBulkStart: raw.preloadKnowledgeOnBulkStart ?? base.preloadKnowledgeOnBulkStart,
  };
}
