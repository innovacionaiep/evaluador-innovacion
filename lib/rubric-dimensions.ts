export type RubricDimension = {
  name: string;
  content: string;
};

export type RubricSubdimension = {
  name: string;
  content: string;
};

const CANONICAL_DIMENSIONS: Array<{ label: string; header: RegExp }> = [
  {
    label: "Novedad",
    header:
      /(?:^|\n)\s*(?:[-=*#]+\s*)*(?:Dimensi[oó]n\s+)?Novedad\s*[:-]/im,
  },
  {
    label: "Potencial de impacto",
    header:
      /(?:^|\n)\s*(?:[-=*#]+\s*)*(?:Dimensi[oó]n\s+)?(?:Potencial\s+de\s+[Ii]mpacto|Impacto)\s*[:-]/im,
  },
  {
    label: "Escalabilidad",
    header:
      /(?:^|\n)\s*(?:[-=*#]+\s*)*(?:Dimensi[oó]n\s+)?Escalabilidad\s*[:-]/im,
  },
  {
    label: "Resultado final",
    header:
      /(?:^|\n)\s*(?:[-=*#]+\s*)*(?:Dimensi[oó]n\s+)?Resultado\s+[Ff]inal\s*[:-]/im,
  },
];

type DimensionHeader = { label: string; index: number; headerEnd: number };

function findDimensionHeaders(text: string): DimensionHeader[] {
  const headers: DimensionHeader[] = [];
  const seen = new Set<string>();

  for (const dim of CANONICAL_DIMENSIONS) {
    const match = dim.header.exec(text);
    if (!match) continue;
    if (seen.has(dim.label)) continue;
    seen.add(dim.label);
    headers.push({
      label: dim.label,
      index: match.index,
      headerEnd: match.index + match[0].length,
    });
  }

  return headers.sort((a, b) => a.index - b.index);
}

/**
 * Extrae dimensiones de evaluación desde el texto de la rúbrica.
 * Soporta encabezados IGIP (Dimensión Novedad:, ## Novedad, etc.).
 */
export function parseRubricDimensions(rubricText: string): RubricDimension[] {
  const text = rubricText.trim();
  if (!text) return [];

  const headers = findDimensionHeaders(text);
  if (headers.length > 0) {
    const dimensions: RubricDimension[] = [];
    for (let i = 0; i < headers.length; i++) {
      const start = headers[i].headerEnd;
      const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
      const content = text.slice(start, end).trim();
      if (content.length > 20) {
        dimensions.push({ name: headers[i].label, content });
      }
    }
    if (dimensions.length > 0) return dimensions;
  }

  // Fallback legado: nombres sueltos al inicio de línea con : o -
  const dimensions: RubricDimension[] = [];
  const found = new Set<string>();
  const legacyNames = [
    "Novedad",
    "Potencial de impacto",
    "Potencial de Impacto",
    "Impacto",
    "Escalabilidad",
    "Resultado final",
    "Resultado Final",
  ];

  for (const name of legacyNames) {
    const regex = new RegExp(
      `(?:^|\\n)\\s*(?:#{1,3}\\s*)?(?:\\*\\*)?${escapeRegex(name)}(?:\\*\\*)?\\s*[:\\-]`,
      "i"
    );
    const match = regex.exec(text);
    if (!match) continue;
    const normName = normalizeDimensionName(name);
    if (found.has(normName)) continue;

    const start = match.index + match[0].length;
    let end = text.length;
    for (const other of legacyNames) {
      if (other.toLowerCase() === name.toLowerCase()) continue;
      const nextRegex = new RegExp(
        `(?:^|\\n)\\s*(?:#{1,3}\\s*)?(?:\\*\\*)?${escapeRegex(other)}(?:\\*\\*)?\\s*[:\\-]`,
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

/**
 * Extrae subdimensiones desde el bloque de una dimensión.
 * Soporta: Subdimensión "Nombre" / Subdimensión Nombre
 */
export function parseRubricSubdimensions(dimensionContent: string): RubricSubdimension[] {
  const text = dimensionContent.trim();
  if (!text) return [];

  const regex =
    /\bSubdimensi[oó]n\s+(?:"([^"]+)"|'([^']+)'|([A-ZÁÉÍÓÚÑ][^\n]*?))\s*(?=\n|$)/gi;
  const matches: { index: number; length: number; name: string }[] = [];

  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const name = (m[1] || m[2] || m[3] || "").trim();
    if (name) matches.push({ index: m.index, length: m[0].length, name });
  }

  const subdims: RubricSubdimension[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();
    if (content.length > 20) {
      subdims.push({ name: matches[i].name, content });
    }
  }
  return subdims;
}

/** Resumen corto del proyecto para queries RAG en evaluación. */
export function summarizeProjectForRag(
  table: { element: string; content: string }[],
  maxChars = 2000
): string {
  const text = table.map((r) => `${r.element}: ${r.content}`).join("\n");
  return text.length > maxChars ? text.slice(0, maxChars) + "…" : text;
}
