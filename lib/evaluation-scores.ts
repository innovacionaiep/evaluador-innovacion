import {
  parseRubricDimensions,
  parseRubricSubdimensions,
} from "@/lib/rubric-dimensions";

export type RubricScoreSchemaEntry = {
  dimension: string;
  name: string;
  weight: number | null;
  key: string;
};

export function subdimensionScoreKey(dimension: string, name: string): string {
  return `${dimension} / ${name}`;
}

/** Extrae ponderación desde contenido de subdimensión, ej. "Ponderación (25%)". */
export function parseSubdimensionWeight(subContent: string): number | null {
  const m = /Ponderaci[oó]n\s*\((\d+(?:[.,]\d+)?)\s*%\)/i.exec(subContent);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compara nombres de subdimensión tolerando abreviaturas y puntuación. */
export function subdimensionNamesMatch(expected: string, found: string): boolean {
  const a = normalizeNameForMatch(expected);
  const b = normalizeNameForMatch(found);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const tokensA = a.split(" ").filter((t) => t.length > 3);
  if (tokensA.length === 0) return false;
  const hits = tokensA.filter((t) => b.includes(t)).length;
  return hits >= Math.max(2, Math.ceil(tokensA.length * 0.55));
}

function parseScoreFromMatches(matches: RegExpMatchArray[]): number | null {
  for (let i = matches.length - 1; i >= 0; i--) {
    const n = parseInt(matches[i][1], 10);
    if (n >= 1 && n <= 4) return n;
  }
  return null;
}

/** Extrae nota 1–4 desde texto de evaluación de subdimensión. */
export function parseSubdimensionScore(llmText: string): number | null {
  const text = llmText.trim();
  if (!text) return null;

  const notaLineMatches = [
    ...text.matchAll(
      /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\*\*)?Nota(?:\*\*)?\s*(?:asignada|obtenida|final)?\s*[:\-–—]?\s*([1-4])\b/gi
    ),
  ];
  const fromNotaLine = parseScoreFromMatches(notaLineMatches);
  if (fromNotaLine != null) return fromNotaLine;

  const inlineNota = /(?:^|\n)\s*Nota\s*(?:asignada|obtenida|final)?\s*[:\-–—]?\s*([1-4])\b/i.exec(
    text
  );
  if (inlineNota) return parseInt(inlineNota[1], 10);

  const califMatches = [
    ...text.matchAll(
      /(?:^|\n)\s*(?:Calificaci[oó]n|Puntuaci[oó]n|Valor)(?:\s+(?:asignada|obtenida|final))?\s*[:\-–—]?\s*([1-4])\b/gi
    ),
  ];
  const fromCalif = parseScoreFromMatches(califMatches);
  if (fromCalif != null) return fromCalif;

  const assignMatches = [
    ...text.matchAll(
      /(?:asignamos?|otorgamos?|corresponde)\s+(?:la\s+)?nota\s+([1-4])\b/gi
    ),
  ];
  const fromAssign = parseScoreFromMatches(assignMatches);
  if (fromAssign != null) return fromAssign;

  const scaleMatches = [...text.matchAll(/(?:^|\n)\s*([1-4])\s*\/\s*4\b/gi)];
  const fromScale = parseScoreFromMatches(scaleMatches);
  if (fromScale != null) return fromScale;

  const notaBlock = /\*\*Nota\*\*[\s\S]{0,120}/i.exec(text);
  if (notaBlock) {
    const after = notaBlock[0].replace(/\*\*Nota\*\*/i, "");
    const digit = /[1-4]/.exec(after);
    if (digit) return parseInt(digit[0], 10);
  }

  for (let i = text.split("\n").length - 1; i >= 0; i--) {
    const t = text.split("\n")[i].trim();
    if (/^[1-4]$/.test(t)) return parseInt(t, 10);
  }

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lista bloques Subdimensión detectados en un informe o análisis crudo. */
export function listSubdimensionSections(text: string): { name: string; body: string }[] {
  const sections: { name: string; body: string }[] = [];
  const headerRe =
    /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.\d+\s+)?Subdimensi[oó]n[:\s]+["']?(.+?)["']?\s*(?:\([^)]*\))?\s*\n/gi;
  const matches = [...text.matchAll(headerRe)];
  for (let i = 0; i < matches.length; i++) {
    const rawName = (matches[i][1] ?? "").trim().replace(/\s*\([^)]*\)\s*$/, "");
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const body = text.slice(start, end).trim();
    if (rawName && body) sections.push({ name: rawName, body });
  }
  return sections;
}

/** Extrae el bloque de texto de una subdimensión dentro de un informe o análisis crudo. */
export function extractSubdimensionSection(text: string, subdimensionName: string): string | null {
  for (const sec of listSubdimensionSections(text)) {
    if (subdimensionNamesMatch(subdimensionName, sec.name)) return sec.body;
  }

  const name = escapeRegex(subdimensionName.trim());
  const patterns = [
    new RegExp(
      `(?:#{1,3}\\s*)?Subdimensi[oó]n[:\\s]*["']?${name}["']?[^\\n]*\\n([\\s\\S]*?)(?=(?:#{1,3}\\s*)?Subdimensi[oó]n|#{1,2}\\s*Dimensi[oó]n|$)`,
      "i"
    ),
    new RegExp(
      `\\d+\\.\\d+\\s+Subdimensi[oó]n\\s+["']?${name}["']?[\\s\\S]*?(?=\\d+\\.\\d+\\s+Subdimensi[oó]n|#{1,2}\\s*\\d|$)`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]?.trim()) return m[1].trim();
    if (m?.[0]?.trim()) return m[0].trim();
  }
  return null;
}

export function parseSubdimensionScoreFromNamedSection(
  text: string,
  _dimension: string,
  subdimensionName: string
): number | null {
  const section = extractSubdimensionSection(text, subdimensionName);
  if (!section) return null;
  return parseSubdimensionScore(section);
}

/** Completa notas faltantes buscando en análisis crudo e informe formateado. */
export function backfillSubdimensionScores(
  schema: RubricScoreSchemaEntry[],
  scores: Record<string, number | null>,
  sources: string[]
): Record<string, number | null> {
  const out = { ...scores };
  for (const entry of schema) {
    if (out[entry.key] != null) continue;
    for (const src of sources) {
      if (!src?.trim()) continue;

      for (const sec of listSubdimensionSections(src)) {
        if (!subdimensionNamesMatch(entry.name, sec.name)) continue;
        const parsed = parseSubdimensionScore(sec.body);
        if (parsed != null) {
          out[entry.key] = parsed;
          break;
        }
      }
      if (out[entry.key] != null) break;

      const parsed = parseSubdimensionScoreFromNamedSection(
        src,
        entry.dimension,
        entry.name
      );
      if (parsed != null) {
        out[entry.key] = parsed;
        break;
      }
    }
  }
  return out;
}

export function buildRubricScoreSchema(rubricText: string): RubricScoreSchemaEntry[] {
  const dimensions = parseRubricDimensions(rubricText);
  const entries: RubricScoreSchemaEntry[] = [];

  for (const dim of dimensions) {
    for (const sub of parseRubricSubdimensions(dim.content)) {
      entries.push({
        dimension: dim.name,
        name: sub.name,
        weight: parseSubdimensionWeight(sub.content),
        key: subdimensionScoreKey(dim.name, sub.name),
      });
    }
  }
  return entries;
}

/**
 * Calcula nota ponderada del indicador.
 * Requiere todas las notas de subdimensión; si falta alguna, devuelve null.
 * Sin ponderación explícita usa peso uniforme (1) por subdimensión.
 */
export function computeWeightedIndicatorScore(
  schema: RubricScoreSchemaEntry[],
  scores: Record<string, number | null>
): number | null {
  if (schema.length === 0) return null;

  const entries: { score: number; weight: number }[] = [];
  for (const entry of schema) {
    const score = scores[entry.key];
    if (score == null || score < 1 || score > 4) return null;
    entries.push({ score, weight: entry.weight ?? 1 });
  }

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight === 0) return null;

  const weighted = entries.reduce((sum, e) => sum + e.score * e.weight, 0) / totalWeight;
  return Math.round(weighted * 100) / 100;
}

/** Formato legible del indicador IGIP (hasta 2 decimales, sin ceros finales). */
export function formatIndicatorScore(score: number): string {
  const rounded = Math.round(score * 100) / 100;
  const fixed = rounded.toFixed(2);
  if (fixed.endsWith("00")) return String(Math.round(rounded));
  if (fixed.endsWith("0")) return fixed.slice(0, -1);
  return fixed;
}

/** Bloque determinista de notas e índice IGIP para el informe/PDF. */
export function buildAuthoritativeScoresSection(
  schema: RubricScoreSchemaEntry[],
  scores: Record<string, number | null>,
  overallScore: number | null
): string {
  const lines = ["**Notas por subdimensión e índice IGIP**", ""];
  for (const entry of schema) {
    const score = scores[entry.key];
    if (score != null) lines.push(`${entry.name}: ${score}`);
  }
  if (overallScore != null) {
    lines.push("", `**Índice IGIP**: ${formatIndicatorScore(overallScore)}`);
  }
  return lines.join("\n");
}

const SCORES_SECTION_HEADER =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+(?:\.\d+)?\.?\s+)?(?:\*\*)?Notas por subdimensi[oó]n(?:\s+e\s+[íi]ndice\s+IGIP)?(?:\*\*)?[^\n]*/i;

/**
 * Reemplaza la sección de notas generada por el LLM (promedio simple erróneo)
 * por el bloque calculado con ponderaciones de la rúbrica.
 */
export function injectAuthoritativeScoresSection(
  report: string,
  schema: RubricScoreSchemaEntry[],
  scores: Record<string, number | null>,
  overallScore: number | null
): string {
  const section = buildAuthoritativeScoresSection(schema, scores, overallScore);
  const match = SCORES_SECTION_HEADER.exec(report);
  if (match) {
    const before = report.slice(0, match.index).trimEnd();
    return `${before}\n\n${section}`;
  }
  return `${report.trimEnd()}\n\n${section}`;
}

const PROJECT_SUMMARY_PATTERNS = [
  /resumen del proyecto/i,
  /^\s*\*{0,2}\s*\d+\.\s*resumen/i,
  /\b(el|la)\s+proyecto\s+[\wáéíóúñ]+/i,
  /tiene como objetivo/i,
  /objetivo (principal|general)/i,
  /es una (evoluci[oó]n|iniciativa|propuesta|plataforma)/i,
];

/** Detecta si un texto describe el proyecto en lugar de la evaluación. */
export function isProjectDescriptionSummary(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return PROJECT_SUMMARY_PATTERNS.some((p) => p.test(t));
}

/** Síntesis evaluativa determinista a partir de notas (fallback). */
export function buildDeterministicEvaluationSummary(
  schema: RubricScoreSchemaEntry[],
  scores: Record<string, number | null>,
  overallScore: number | null
): string {
  const parts: string[] = [];
  if (overallScore != null) {
    const note =
      overallScore % 1 === 0 ? String(overallScore) : overallScore.toFixed(1);
    parts.push(`Evaluación IGIP: nota ${note}.`);
  }

  const lows: string[] = [];
  const highs: string[] = [];
  for (const entry of schema) {
    const s = scores[entry.key];
    if (s == null) continue;
    const short = abbreviateSubdimensionName(entry.name, 36);
    if (s <= 2) lows.push(`${short} (${s})`);
    else if (s >= 3) highs.push(`${short} (${s})`);
  }
  if (highs.length) parts.push(`Fortalezas en ${highs.slice(0, 2).join("; ")}.`);
  if (lows.length) parts.push(`Debilidades en ${lows.slice(0, 2).join("; ")}.`);

  if (parts.length === 0) {
    return "Evaluación IGIP completada; consulte el informe para el detalle por subdimensión.";
  }
  return truncateSummary(parts.join(" "), 300);
}

/** Valida síntesis LLM o usa fallback determinista. */
export function finalizeEvaluationSummary(
  llmText: string,
  schema: RubricScoreSchemaEntry[],
  scores: Record<string, number | null>,
  overallScore: number | null
): string {
  const clean = llmText.trim();
  if (clean && !isProjectDescriptionSummary(clean)) {
    return truncateSummary(clean, 300);
  }
  return buildDeterministicEvaluationSummary(schema, scores, overallScore);
}

/** Input acotado para síntesis: solo notas y fragmentos evaluativos. */
export function buildEvaluationInputForSummary(
  rawEvaluation: string,
  sanitizedReport: string,
  schema: RubricScoreSchemaEntry[],
  scores: Record<string, number | null>
): string {
  const lines: string[] = ["Notas por subdimensión:"];
  for (const entry of schema) {
    const s = scores[entry.key];
    if (s != null) lines.push(`- ${entry.dimension} / ${entry.name}: ${s}`);
  }

  const synthMatch = /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?S[ií]ntesis[\s\S]*/i.exec(
    sanitizedReport
  );
  if (synthMatch?.[0]?.trim()) {
    lines.push("", "Síntesis del informe:", synthMatch[0].slice(0, 2500));
  } else {
    const evalOnly = rawEvaluation
      .split(/\n---\n/)
      .map((block) =>
        block
          .split("\n")
          .filter((line) => !/^\s*##\s*Dimensi[oó]n:/i.test(line))
          .join("\n")
      )
      .join("\n\n");
    lines.push("", "Fragmentos evaluativos:", evalOnly.slice(0, 4500));
  }
  return lines.join("\n");
}

/** Trunca texto a maxLen caracteres en límite de palabra. */
export function truncateSummary(text: string, maxLen = 300): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.7) return `${slice.slice(0, lastSpace)}…`;
  return `${slice}…`;
}

/** Abrevia nombre de subdimensión para encabezado de tabla. */
export function abbreviateSubdimensionName(name: string, maxLen = 24): string {
  const t = name.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}
