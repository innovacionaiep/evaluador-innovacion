export type RubricDimension = {
  name: string;
  content: string;
};

const IGIP_DIMENSION_NAMES = [
  "Novedad",
  "Potencial de impacto",
  "Potencial de Impacto",
  "Impacto",
  "Escalabilidad",
  "Resultado final",
  "Resultado Final",
];

/**
 * Extrae dimensiones de evaluación desde el texto de la rúbrica.
 * Soporta encabezados IGIP (Novedad, Impacto, Escalabilidad) y bloques ## o líneas en mayúsculas.
 */
export function parseRubricDimensions(rubricText: string): RubricDimension[] {
  const text = rubricText.trim();
  if (!text) return [];

  const dimensions: RubricDimension[] = [];
  const found = new Set<string>();

  for (const name of IGIP_DIMENSION_NAMES) {
    const regex = new RegExp(
      `(?:^|\\n)\\s*(?:#{1,3}\\s*)?(?:\\*\\*)?${escapeRegex(name)}(?:\\*\\*)?\\s*[:\\-]?`,
      "i"
    );
    const match = regex.exec(text);
    if (!match) continue;
    const normName = normalizeDimensionName(name);
    if (found.has(normName)) continue;

    const start = match.index + match[0].length;
    let end = text.length;
    for (const other of IGIP_DIMENSION_NAMES) {
      if (other.toLowerCase() === name.toLowerCase()) continue;
      const nextRegex = new RegExp(
        `(?:^|\\n)\\s*(?:#{1,3}\\s*)?(?:\\*\\*)?${escapeRegex(other)}(?:\\*\\*)?\\s*[:\\-]?`,
        "i"
      );
      const nextMatch = nextRegex.exec(text.slice(start));
      if (nextMatch && nextMatch.index >= 0) {
        end = Math.min(end, start + nextMatch.index);
      }
    }
    const content = text.slice(start, end).trim();
    if (content.length > 20) {
      dimensions.push({ name: normName, content });
      found.add(normName);
    }
  }

  if (dimensions.length > 0) return dimensions;

  // Fallback: bloques separados por doble salto y título en primera línea
  const blocks = text.split(/\n\s*\n+/).filter((b) => b.trim().length > 40);
  for (const block of blocks.slice(0, 6)) {
    const lines = block.trim().split("\n");
    const title = lines[0]?.replace(/^#+\s*|\*\*/g, "").trim().slice(0, 80);
    const body = lines.slice(1).join("\n").trim() || block;
    if (title && body.length > 30) {
      dimensions.push({ name: title, content: body });
    }
  }

  if (dimensions.length === 0) {
    return [{ name: "Evaluación general", content: text }];
  }
  return dimensions;
}

function normalizeDimensionName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("novedad")) return "Novedad";
  if (lower.includes("impacto")) return "Potencial de impacto";
  if (lower.includes("escalabilidad")) return "Escalabilidad";
  if (lower.includes("resultado")) return "Resultado final";
  return name.trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Resumen corto del proyecto para queries RAG en evaluación. */
export function summarizeProjectForRag(
  table: { element: string; content: string }[],
  maxChars = 2000
): string {
  const text = table.map((r) => `${r.element}: ${r.content}`).join("\n");
  return text.length > maxChars ? text.slice(0, maxChars) + "…" : text;
}
