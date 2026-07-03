import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  backfillSubdimensionScores,
  buildDeterministicEvaluationSummary,
  buildRubricScoreSchema,
  computeWeightedIndicatorScore,
  finalizeEvaluationSummary,
  formatIndicatorScore,
  injectAuthoritativeScoresSection,
  isProjectDescriptionSummary,
  listSubdimensionSections,
  parseSubdimensionScore,
  parseSubdimensionWeight,
  subdimensionScoreKey,
  subdimensionNamesMatch,
  truncateSummary,
} from "@/lib/evaluation-scores";

const NOVEDAD_BLOCK = `Subdimensión "Grado de Originalidad de la Idea"
- Ponderación (25%)
- Nota 1: La idea presenta similitudes significativas.

Subdimensión "Estado del arte"
- Ponderación (15%)
- Nota 1: La propuesta muestra poca evidencia.`;

const SAMPLE_RUBRIC = `----------Dimensión Novedad:-------------
${NOVEDAD_BLOCK}
----------Dimensión Potencial de impacto:-------------
Subdimensión "Contribución Social, Ambiental o Productivo"
- Ponderación (20%)
- Nota 1: Sin impacto.`;

describe("parseSubdimensionWeight", () => {
  it("extrae porcentaje de ponderación", () => {
    assert.equal(parseSubdimensionWeight("- Ponderación (25%)\n"), 25);
    assert.equal(parseSubdimensionWeight("Ponderación (12.5%)"), 12.5);
    assert.equal(parseSubdimensionWeight("sin peso"), null);
  });
});

describe("parseSubdimensionScore", () => {
  it("parsea variantes de nota 1-4", () => {
    assert.equal(parseSubdimensionScore("**Nota**: 3\nJustificación…"), 3);
    assert.equal(parseSubdimensionScore("Nota: 4"), 4);
    assert.equal(parseSubdimensionScore("Nota asignada: 2"), 2);
    assert.equal(parseSubdimensionScore("Calificación: 3"), 3);
    assert.equal(parseSubdimensionScore("**Nota**\n2\nJustificación"), 2);
    assert.equal(parseSubdimensionScore("Análisis sin nota"), null);
    assert.equal(parseSubdimensionScore("Nota: 5"), null);
  });

  it("prefiere la última línea Nota cuando el análisis menciona otras cifras", () => {
    const text = `**Análisis**
En escala 1-4 podría ser nota 2 por similitud con el estado del arte.

**Nota**: 3

**Justificación**
Por encima del mínimo.`;
    assert.equal(parseSubdimensionScore(text), 3);
  });
});

describe("subdimensionNamesMatch", () => {
  it("empareja nombres con variaciones de puntuación", () => {
    assert.equal(
      subdimensionNamesMatch(
        "Contribución Social, Ambiental o Productivo",
        "Contribución Social Ambiental o Productivo"
      ),
      true
    );
  });
});

describe("listSubdimensionSections", () => {
  it("detecta secciones numeradas del informe IGIP", () => {
    const report = `3.1 Subdimensión Contribución Social, Ambiental o Productivo (Análisis, nota…)
**Análisis**
Texto.

**Nota**: 3

**Justificación**
Más texto.`;
    const sections = listSubdimensionSections(report);
    const contrib = sections.find((s) => s.name.includes("Contribución"));
    assert.ok(contrib);
    assert.equal(parseSubdimensionScore(contrib!.body), 3);
  });
});

describe("backfillSubdimensionScores", () => {
  it("recupera nota desde informe formateado si faltó en análisis crudo", () => {
    const schema = buildRubricScoreSchema(SAMPLE_RUBRIC);
    const estado = schema.find((s) => s.name.toLowerCase().includes("estado"));
    if (!estado) return;
    const report = `### Subdimensión: ${estado.name}\n\n**Análisis**\nTexto.\n\n**Nota**: 3\n\n**Justificación**\nTexto.`;
    const scores: Record<string, number | null> = { [estado.key]: null };
    const filled = backfillSubdimensionScores(schema, scores, [report]);
    assert.equal(filled[estado.key], 3);
  });

  it("recupera Contribución Social desde informe con encabezado numerado", () => {
    const schema = buildRubricScoreSchema(SAMPLE_RUBRIC);
    const contrib = schema.find((s) => s.name.includes("Contribución"));
    if (!contrib) return;
    const report = `3.1 Subdimensión Contribución Social, Ambiental o Productivo
**Análisis**
Impacto moderado.

Nota: 2

**Justificación**
Limitado alcance.`;
    const scores: Record<string, number | null> = { [contrib.key]: null };
    const filled = backfillSubdimensionScores(schema, scores, [report]);
    assert.equal(filled[contrib.key], 2);
  });
});

describe("finalizeEvaluationSummary", () => {
  it("rechaza resumen del proyecto y usa síntesis determinista", () => {
    const schema = buildRubricScoreSchema(SAMPLE_RUBRIC);
    const scores: Record<string, number | null> = {};
    for (const e of schema) scores[e.key] = 3;
    const bad = "**1. Resumen del proyecto** El proyecto X tiene como objetivo…";
    const result = finalizeEvaluationSummary(bad, schema, scores, 3);
    assert.equal(isProjectDescriptionSummary(bad), true);
    assert.ok(!/resumen del proyecto/i.test(result));
    assert.ok(/Evaluación IGIP/i.test(result));
  });

  it("acepta síntesis evaluativa válida del LLM", () => {
    const schema = buildRubricScoreSchema(SAMPLE_RUBRIC);
    const scores: Record<string, number | null> = {};
    for (const e of schema) scores[e.key] = 2;
    const good = "Evaluación IGIP con debilidades en originalidad y estado del arte; nota global 2.";
    const result = finalizeEvaluationSummary(good, schema, scores, 2);
    assert.equal(result, good);
  });
});

describe("buildDeterministicEvaluationSummary", () => {
  it("incluye nota global y fortalezas/debilidades", () => {
    const schema = buildRubricScoreSchema(SAMPLE_RUBRIC);
    const scores: Record<string, number | null> = {};
    for (const e of schema) {
      scores[e.key] = e.name.includes("Originalidad") ? 4 : 2;
    }
    const text = buildDeterministicEvaluationSummary(schema, scores, 2.8);
    assert.ok(/Evaluación IGIP/i.test(text));
    assert.ok(/Fortalezas/i.test(text));
    assert.ok(/Debilidades/i.test(text));
  });
});

describe("computeWeightedIndicatorScore", () => {
  it("calcula promedio ponderado cuando hay todas las notas", () => {
    const schema = buildRubricScoreSchema(SAMPLE_RUBRIC);
    const scores: Record<string, number | null> = {};
    for (const entry of schema) {
      scores[entry.key] = entry.name.includes("Originalidad") ? 4 : 2;
    }
    const overall = computeWeightedIndicatorScore(schema, scores);
    assert.ok(overall != null);
    // (4*25 + 2*15 + 2*20) / 60 = 2.83
    assert.equal(overall, 2.83);
  });

  it("devuelve null si falta alguna nota", () => {
    const schema = buildRubricScoreSchema(SAMPLE_RUBRIC);
    const key = subdimensionScoreKey("Novedad", "Grado de Originalidad de la Idea");
    const scores: Record<string, number | null> = { [key]: 3 };
    assert.equal(computeWeightedIndicatorScore(schema, scores), null);
  });

  it("usa peso uniforme si no hay ponderación explícita", () => {
    const schema = [
      {
        dimension: "Novedad",
        name: "A",
        weight: null,
        key: subdimensionScoreKey("Novedad", "A"),
      },
      {
        dimension: "Novedad",
        name: "B",
        weight: null,
        key: subdimensionScoreKey("Novedad", "B"),
      },
    ];
    const scores = {
      [schema[0].key]: 4,
      [schema[1].key]: 2,
    };
    assert.equal(computeWeightedIndicatorScore(schema, scores), 3);
  });
});

describe("formatIndicatorScore", () => {
  it("muestra hasta 2 decimales sin ceros finales", () => {
    assert.equal(formatIndicatorScore(2.95), "2.95");
    assert.equal(formatIndicatorScore(3), "3");
    assert.equal(formatIndicatorScore(2.83), "2.83");
    assert.equal(formatIndicatorScore(2.7), "2.7");
  });
});

describe("injectAuthoritativeScoresSection", () => {
  it("reemplaza sección LLM con índice ponderado correcto", () => {
    const schema = buildRubricScoreSchema(SAMPLE_RUBRIC);
    const scores: Record<string, number | null> = {};
    for (const entry of schema) {
      scores[entry.key] = entry.name.includes("Originalidad") ? 4 : 2;
    }
    const overall = computeWeightedIndicatorScore(schema, scores);
    const llmReport = `## Informe

**Notas por subdimensión e índice IGIP**

Grado de Originalidad de la Idea: 4
Estado del arte: 2
Contribución Social, Ambiental o Productivo: 2

**Índice IGIP**: 2.7`;

    const fixed = injectAuthoritativeScoresSection(llmReport, schema, scores, overall);
    assert.ok(!fixed.includes("2.7"));
    assert.match(fixed, /\*\*Índice IGIP\*\*: 2\.83/);
    assert.doesNotMatch(fixed, /Índice IGIP.*\n.*Índice IGIP/s);
  });
});

describe("truncateSummary", () => {
  it("trunca a 300 caracteres", () => {
    const long = "a".repeat(400);
    const result = truncateSummary(long, 300);
    assert.ok(result.length <= 301);
    assert.ok(result.endsWith("…"));
  });
});

describe("buildRubricScoreSchema", () => {
  it("incluye ponderaciones por subdimensión", () => {
    const schema = buildRubricScoreSchema(SAMPLE_RUBRIC);
    assert.equal(schema.length, 3);
    assert.equal(schema[0].weight, 25);
    assert.equal(schema[1].weight, 15);
    assert.equal(schema[2].weight, 20);
  });
});
