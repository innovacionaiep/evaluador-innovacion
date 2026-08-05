import { createEvaluationTypePostgres, getEvaluationTypesPostgres, deleteEvaluationTypePostgres } from "@/lib/db-postgres";
import {
  FIXED_EVAL_TYPE_KEYS,
  canonicalFixedName,
  fixedKeyFor,
  isFixedEvalTypeName,
  normalizeEvalTypeName,
  type FixedEvalTypeKey,
} from "./constants";
import { syncTrlElementsFromIgip } from "./sync-trl-elements-from-igip";

export type EnsuredEvalType = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

/**
 * Garantiza filas IGIP, IMET y TRL. No recrea config si el tipo ya existe.
 * Elimina tipos que no sean fijos.
 */
export async function ensureFixedEvaluationTypes(): Promise<EnsuredEvalType[]> {
  const existing = await getEvaluationTypesPostgres();
  const byKey = new Map<FixedEvalTypeKey, EnsuredEvalType>();

  for (const row of existing) {
    const n = normalizeEvalTypeName(row.name);
    if (n.includes("TRL")) {
      const prev = byKey.get("TRL");
      if (!prev) byKey.set("TRL", row);
      // Preferir el TRL que ya tiene Knowledge configurado.
      else {
        const { getConfigPostgres } = await import("@/lib/db-postgres");
        const [prevCfg, rowCfg] = await Promise.all([
          getConfigPostgres(prev.id),
          getConfigPostgres(row.id),
        ]);
        const prevPaths = (() => {
          try {
            const p = JSON.parse(prevCfg?.knowledge_paths || "[]");
            return Array.isArray(p) ? p.length : 0;
          } catch {
            return 0;
          }
        })();
        const rowPaths = (() => {
          try {
            const p = JSON.parse(rowCfg?.knowledge_paths || "[]");
            return Array.isArray(p) ? p.length : 0;
          } catch {
            return 0;
          }
        })();
        if (rowPaths > prevPaths) byKey.set("TRL", row);
      }
    } else if (n.includes("IMET") && !byKey.has("IMET")) {
      byKey.set("IMET", row);
    } else if (n.includes("IGIP") && !byKey.has("IGIP")) {
      byKey.set("IGIP", row);
    }
  }

  for (const key of FIXED_EVAL_TYPE_KEYS) {
    if (!byKey.has(key)) {
      const name = canonicalFixedName(key);
      const id = await createEvaluationTypePostgres(name);
      byKey.set(key, {
        id,
        name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  for (const row of existing) {
    if (!isFixedEvalTypeName(row.name)) {
      try {
        await deleteEvaluationTypePostgres(row.id);
      } catch {
        // Proyectos huérfanos: se ignora el fallo de borrado para no tumbar el listado.
      }
    } else {
      const key = fixedKeyFor(row.name);
      const kept = byKey.get(key);
      if (kept && kept.id !== row.id) {
        try {
          await deleteEvaluationTypePostgres(row.id);
        } catch {
          /* ignore */
        }
      }
    }
  }

  try {
    await syncTrlElementsFromIgip();
  } catch {
    // No tumbar el listado si falla la sincronización de elementos.
  }

  return FIXED_EVAL_TYPE_KEYS.map((key) => byKey.get(key)!).filter(Boolean);
}
