import { normalizeForMatch } from "@/lib/text-match";
import type { ElementRow } from "@/lib/project-extract-pipeline";

const MIN_DUPLICATE_COMPARE_CHARS = 80;
const SIMILARITY_THRESHOLD = 0.92;

export function normalizeContentForCompare(text: string): string {
  return normalizeForMatch(text).replace(/\s+/g, " ").trim();
}

/** Similitud 0–1 por proporción del texto más corto contenido en el más largo. */
export function contentSimilarity(a: string, b: string): number {
  const na = normalizeContentForCompare(a);
  const nb = normalizeContentForCompare(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  if (shorter.length < MIN_DUPLICATE_COMPARE_CHARS) return 0;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  return 0;
}

export function areContentsDuplicate(a: string, b: string): boolean {
  return contentSimilarity(a, b) >= SIMILARITY_THRESHOLD;
}

export type DuplicateContentGroup = {
  titles: string[];
  sharedContent: string;
};

/** Agrupa elementos cuyo contenido extraído es igual o casi igual. */
export function findDuplicateContentGroups(rows: ElementRow[]): DuplicateContentGroup[] {
  const groups: DuplicateContentGroup[] = [];
  const used = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    const ca = a.content.trim();
    if (!ca || ca.length < MIN_DUPLICATE_COMPARE_CHARS || used.has(a.element)) continue;

    const titles = [a.element];
    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j];
      if (areContentsDuplicate(ca, b.content)) {
        titles.push(b.element);
      }
    }

    if (titles.length > 1) {
      for (const t of titles) used.add(t);
      groups.push({ titles, sharedContent: ca });
    }
  }
  return groups;
}

export function buildDuplicateRetryHint(
  elementTitle: string,
  otherTitles: string[],
  duplicatedContent: string
): string {
  const preview = duplicatedContent.slice(0, 220).replace(/\s+/g, " ");
  return `

REINTENTO POR CONTENIDO DUPLICADO:
- El texto extraído para "${elementTitle}" coincide con el de: ${otherTitles.join(", ")}.
- Eso suele ser un ERROR: cada elemento debe tener su propia respuesta del formulario.
- NO reutilices el párrafo duplicado. Busca la fila o sección del Excel que corresponde ÚNICAMENTE a "${elementTitle}".
- Texto duplicado detectado (referencia, no copies): "${preview}…"
- Si el campo es "Factor innovador del proyecto", usa la fila "Factor innovador" / "Diferenciación y propuesta de valor", NO la de continuidad de fases.
- Si el campo es "Continuidad de fases anteriores", describe solo la continuidad; no repitas el bloque de factor innovador si tiene fila propia.`;
}
