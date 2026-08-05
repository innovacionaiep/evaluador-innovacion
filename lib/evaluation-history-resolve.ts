import { getEvaluationTypeById, getEvaluationTypes } from "@/lib/db";
import {
  fixedKeyFor,
  isFixedEvalTypeName,
  normalizeEvalTypeName,
} from "@/lib/eval-types/constants";

/**
 * Resuelve un evaluation_type_id válido para historial.
 * Si el id quedó obsoleto (tipo recreado), busca por nombre / tipo fijo.
 */
export async function resolveHistoryEvaluationTypeId(
  evaluationTypeId: number | null,
  evaluationTypeName: string
): Promise<number | null> {
  if (evaluationTypeId != null) {
    const byId = await getEvaluationTypeById(evaluationTypeId);
    if (byId) return byId.id;
  }

  const nameKey = normalizeEvalTypeName(evaluationTypeName);
  if (!nameKey) return null;

  const types = await getEvaluationTypes();
  const exact = types.find((t) => normalizeEvalTypeName(t.name) === nameKey);
  if (exact) return exact.id;

  if (isFixedEvalTypeName(evaluationTypeName)) {
    const key = fixedKeyFor(evaluationTypeName);
    const byFixed = types.find((t) => fixedKeyFor(t.name) === key);
    if (byFixed) return byFixed.id;
  }

  return null;
}
