import { parseAssignedLevel } from "@/lib/rubric-niveles";
import { TRL_LEVEL_SCORE_KEY } from "@/lib/rubric-config";

const DEFAULT_TRL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Recupera el nivel TRL desde el informe o el borrador cuando el score
 * estructurado llegó null (p. ej. «**Nivel:** 2» o historial antiguo).
 */
export function recoverTrlLevelFromText(
  text: string,
  validLevels: number[] = DEFAULT_TRL_LEVELS
): number | null {
  const body = text?.trim();
  if (!body) return null;
  const levels = validLevels.length > 0 ? validLevels : DEFAULT_TRL_LEVELS;
  return parseAssignedLevel(body, levels);
}

/** Rellena overall + clave canónica trl:nivel si faltan y el texto trae Nivel: N. */
export function ensureTrlScoresFromText(params: {
  reportOrDraft: string;
  subdimensionScores?: Record<string, number | null>;
  overallScore?: number | null;
  validLevels?: number[];
}): {
  subdimensionScores: Record<string, number | null>;
  overallScore: number | null;
  recovered: boolean;
} {
  const subs = { ...(params.subdimensionScores ?? {}) };
  let overall =
    typeof params.overallScore === "number" && Number.isFinite(params.overallScore)
      ? params.overallScore
      : null;
  const fromKey = subs[TRL_LEVEL_SCORE_KEY];
  if (typeof fromKey === "number" && Number.isFinite(fromKey) && overall == null) {
    overall = fromKey;
  }
  if (overall != null && (fromKey == null || !Number.isFinite(fromKey))) {
    subs[TRL_LEVEL_SCORE_KEY] = overall;
    return { subdimensionScores: subs, overallScore: overall, recovered: false };
  }
  if (overall != null) {
    return { subdimensionScores: subs, overallScore: overall, recovered: false };
  }

  const recoveredLevel = recoverTrlLevelFromText(
    params.reportOrDraft,
    params.validLevels ?? DEFAULT_TRL_LEVELS
  );
  if (recoveredLevel == null) {
    return { subdimensionScores: subs, overallScore: null, recovered: false };
  }
  subs[TRL_LEVEL_SCORE_KEY] = recoveredLevel;
  return {
    subdimensionScores: subs,
    overallScore: recoveredLevel,
    recovered: true,
  };
}
