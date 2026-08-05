import { getConfigPostgres, updateConfigPostgres, getEvaluationTypesPostgres } from "@/lib/db-postgres";
import { parseElementDefConfig } from "@/lib/evaluation-type-settings";
import { isIgip, isTrl } from "./constants";

type ElementRow = { title: string; description: string; section: string };

function parseElements(raw: string | undefined): ElementRow[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e) => parseElementDefConfig(e))
      .filter((e): e is NonNullable<typeof e> => e != null)
      .map((e) => ({
        title: e.title,
        description: e.description ?? "",
        section: e.section ?? "",
      }));
  } catch {
    return [];
  }
}

function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Copia a TRL los elementos de IGIP que aún no tiene (por título).
 * Si TRL solo tenía el fixture corto, queda alineado con la config viva de IGIP.
 */
export async function syncTrlElementsFromIgip(): Promise<{ synced: boolean; added: number }> {
  const types = await getEvaluationTypesPostgres();
  const igip = types.find((t) => isIgip(t.name));
  const trl = types.find((t) => isTrl(t.name));
  if (!igip || !trl) return { synced: false, added: 0 };

  const igipCfg = await getConfigPostgres(igip.id);
  const trlCfg = await getConfigPostgres(trl.id);
  if (!igipCfg || !trlCfg) return { synced: false, added: 0 };

  const igipEls = parseElements(igipCfg.elements);
  const trlEls = parseElements(trlCfg.elements);
  if (igipEls.length === 0) return { synced: false, added: 0 };

  const trlTitles = new Set(trlEls.map((e) => titleKey(e.title)));
  const missing = igipEls.filter((e) => !trlTitles.has(titleKey(e.title)));
  if (missing.length === 0) return { synced: false, added: 0 };

  // Orden y textos de IGIP como fuente de verdad (extracción idéntica).
  // No se conservan títulos solo-TRL aquí: la intención es paridad con IGIP.
  await updateConfigPostgres(trl.id, { elements: igipEls });
  return { synced: true, added: missing.length };
}
