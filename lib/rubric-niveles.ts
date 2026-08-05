import type {
  RubricConfigNiveles,
  RubricLevelConfig,
  RubricVariableConfig,
  RubricVariableLevelConfig,
} from "@/lib/rubric-config";

export function syncVariableLevelsWithMain(
  mainLevels: RubricLevelConfig[],
  existing?: RubricVariableLevelConfig[]
): RubricVariableLevelConfig[] {
  return mainLevels.map((main, i) => {
    const prev = existing?.[i];
    return {
      level: main.level,
      title: prev?.title?.trim() || main.title,
      description: prev?.description ?? "",
    };
  });
}

export function syncAllVariableLevels(
  config: RubricConfigNiveles
): RubricConfigNiveles {
  return {
    ...config,
    variables: config.variables.map((v) => ({
      ...v,
      levels: syncVariableLevelsWithMain(config.levels, v.levels),
    })),
  };
}

export function variableEvalContent(variable: RubricVariableConfig): string {
  const lines = [`Variable "${variable.name}"`, "Criterios por nivel (esta perspectiva):"];
  for (const lvl of variable.levels) {
    lines.push(`Nivel ${lvl.level} — ${lvl.title}`, lvl.description);
  }
  return lines.join("\n");
}

export function mainLevelsRubricText(levels: RubricLevelConfig[]): string {
  return levels
    .map((l) => `Nivel ${l.level} — ${l.title}\n${l.description}`)
    .join("\n\n");
}

export function variableLevelKey(variableName: string): string {
  return `variable:${variableName.trim().toLowerCase()}`;
}

/**
 * Extrae el primer «Nivel: N» tolerando markdown (**Nivel:** 2, Nivel: **2**, etc.).
 * Si `validLevels` está vacío, acepta cualquier entero no negativo.
 */
export function parseAssignedLevel(
  text: string,
  validLevels: number[]
): number | null {
  const fromJson = parseVariableLevelJson(text, validLevels);
  if (fromJson != null) return fromJson;

  const patterns = [
    // Nivel TRL autoritativo (informe final)
    /Nivel\s+TRL\s*:\s*(\d+)\b/i,
    // **Nivel:** 2  |  Nivel: **2**  |  Nivel asignado: 2
    /(?:\*{0,2}\s*)?Nivel(?:\s+asignado)?(?:\s+TRL)?\s*\*{0,2}\s*:\s*\*{0,2}\s*(\d+)\b/i,
    // Línea suelta "Nivel 3" cerca de justificación
    /(?:^|\n)\s*(?:\*{0,2}\s*)?Nivel\s+(\d+)\s*(?:\*{0,2}\s*)?(?:\n|$)/i,
  ];

  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    if (validLevels.length === 0 || validLevels.includes(n)) return n;
  }
  return null;
}

/** Extrae `{"nivel": N}` (o fence markdown) del final de la evaluación de variable. */
export function parseVariableLevelJson(
  text: string,
  validLevels: number[]
): number | null {
  const candidates: string[] = [];
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const m of fenced) {
    if (m[1]?.trim()) candidates.push(m[1].trim());
  }
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(text.slice(start, end + 1));
  }

  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const value = parsed.nivel ?? parsed.level ?? parsed.nota ?? parsed.score;
      const n =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? parseInt(value.trim(), 10)
            : NaN;
      if (Number.isInteger(n) && validLevels.includes(n)) return n;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Promedio simple de niveles (ignora null); 2 decimales. */
export function computeAverageLevel(levels: (number | null)[]): number | null {
  const valid = levels.filter((l): l is number => l != null);
  if (valid.length === 0) return null;
  const sum = valid.reduce((a, b) => a + b, 0);
  return Math.round((sum / valid.length) * 100) / 100;
}

/** Nivel global por mayoría; en empate gana el nivel más alto. */
export function computeMajorityLevel(levels: (number | null)[]): number | null {
  const valid = levels.filter((l): l is number => l != null);
  if (valid.length === 0) return null;

  const counts = new Map<number, number>();
  for (const l of valid) {
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }

  let best: number | null = null;
  let bestCount = 0;
  for (const [level, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && (best == null || level > best))
    ) {
      best = level;
      bestCount = count;
    }
  }
  return best;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractVariableSection(
  text: string,
  variableName: string
): string | null {
  const name = escapeRegex(variableName.trim());
  const patterns = [
    new RegExp(
      `(?:#{1,3}\\s*)?Variable[:\\s]*["']?${name}["']?[^\\n]*\\n([\\s\\S]*?)(?=(?:#{1,3}\\s*)?Variable[:\\s]|#{1,2}\\s*Nivel asignado|---\\s*$|$)`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

export function extractGlobalLevelSection(text: string): string | null {
  const m =
    /(?:#{1,2}\s*Nivel asignado(?:\s+global)?[^\n]*\n)([\s\S]*?)$/i.exec(text);
  if (m?.[1]?.trim()) return m[1].trim();
  const afterSep = text.split(/\n---\n/);
  if (afterSep.length > 1) {
    const tail = afterSep[afterSep.length - 1].trim();
    if (tail) return tail.replace(/^#{1,2}\s*Nivel asignado[^\n]*\n?/i, "").trim();
  }
  return null;
}

export function hasRubricVariables(
  rubric: RubricConfigNiveles
): boolean {
  return (rubric.variables?.length ?? 0) > 0;
}

/** Números de nivel de la escala principal (referencia visual). */
export function validLevelNumbers(rubric: RubricConfigNiveles): number[] {
  return rubric.levels.map((l) => l.level);
}

/** Números de subnivel propios de una variable. */
export function validLevelNumbersForVariable(
  variable: RubricVariableConfig
): number[] {
  return variable.levels.map((l) => l.level);
}

/** Escala 1–5 por defecto si la variable no tiene subniveles. */
export function defaultVariableLevelNumbers(): number[] {
  return [1, 2, 3, 4, 5];
}
