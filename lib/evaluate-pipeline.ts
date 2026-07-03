import { getConfig } from "@/lib/db";
import { buildSystemContext } from "@/lib/build-context";
import { streamChat, chatCompletion } from "@/lib/openrouter";
import {
  charRange,
  findDimensionLimits,
  findSubdimensionLimits,
  formatLimitsTable,
  parseReportFormatLimits,
  stripCharacterLimitAnnotations,
  type ReportFormatLimits,
  type SubdimensionFieldLimits,
} from "@/lib/report-format-limits";
import {
  backfillSubdimensionScores,
  buildEvaluationInputForSummary,
  buildRubricScoreSchema,
  computeWeightedIndicatorScore,
  finalizeEvaluationSummary,
  injectAuthoritativeScoresSection,
  parseSubdimensionScore,
  subdimensionScoreKey,
} from "@/lib/evaluation-scores";
import {
  extractSubdimensionScoresViaJson,
  mergeAuthoritativeScores,
} from "@/lib/evaluation-scores-json";
import {
  parseRubricDimensions,
  parseRubricSubdimensions,
  summarizeProjectForRag,
  type RubricDimension,
  type RubricSubdimension,
} from "@/lib/rubric-dimensions";

export type EvaluateStreamEvent =
  | { type: "step"; message: string }
  | { type: "dimension"; name: string; index: number; total: number }
  | {
      type: "subdimension";
      dimension: string;
      name: string;
      index: number;
      total: number;
    }
  | {
      type: "subdimension_score";
      dimension: string;
      name: string;
      score: number | null;
    }
  | {
      type: "scores_summary";
      subdimensionScores: Record<string, number | null>;
      overallScore: number | null;
    }
  | { type: "evaluation_summary"; text: string }
  | { type: "report_content"; content: string }
  | { type: "formatting"; message: string }
  | { type: "content"; chunk: string }
  | { type: "done" }
  | { type: "error"; error: string };

function lengthInstruction(maxChars: number): string {
  const { min, max } = charRange(maxChars);
  return `Longitud objetivo: entre ${min} y ${max} caracteres. NO escribas la cantidad de caracteres en tu respuesta.`;
}

function dimensionOverviewPrompt(dimension: RubricDimension, overviewChars: number): string {
  return `Realiza un análisis breve y general del proyecto para la dimensión "${dimension.name}".

Usa ÚNICAMENTE:
- Los elementos identificados del proyecto en "Documentos del proyecto a evaluar".
- Los fragmentos del Manual de referencia (Knowledge) incluidos en el contexto.
- Los criterios generales de la dimensión en "Enfoque de esta evaluación parcial".

IMPORTANTE:
- Este paso es solo el análisis breve de la dimensión (visión general).
- NO evalúes aún las subdimensiones individualmente ni asignes notas por subcriterio.
- ${lengthInstruction(overviewChars)}
- No uses etiquetas <think>.
- Responde solo con el análisis breve de esta dimensión, sin introducciones genéricas.`.trim();
}

function subdimensionUserPrompt(
  dimension: RubricDimension,
  subdimension: RubricSubdimension,
  fieldLimits: SubdimensionFieldLimits
): string {
  const a = charRange(fieldLimits.analysis);
  const j = charRange(fieldLimits.justification);
  const m = charRange(fieldLimits.improvements);

  return `Evalúa la subdimensión "${subdimension.name}" dentro de la dimensión "${dimension.name}".

Usa ÚNICAMENTE:
- Los elementos identificados del proyecto en "Documentos del proyecto a evaluar".
- Los fragmentos del Manual de referencia (Knowledge) incluidos en el contexto.
- Los criterios de la subdimensión en "Enfoque de esta evaluación parcial".

Incluye estas secciones con las longitudes indicadas (son instrucciones internas; NO las menciones en el texto):
1. **Análisis** — entre ${a.min} y ${a.max} caracteres
2. **Nota** — OBLIGATORIO e INNEGOCIABLE:
   - Una línea exacta con el formato: Nota: N
   - N debe ser un único dígito: 1, 2, 3 o 4 (número arábigo, no palabras)
   - Prohibido omitir la nota, usar rangos, decimales o frases como "nota alta"
3. **Justificación** — entre ${j.min} y ${j.max} caracteres
4. **Posibles mejoras** — entre ${m.min} y ${m.max} caracteres

La línea "Nota: N" debe aparecer en su propia línea, después del Análisis y antes de la Justificación.
Ejemplo válido:
**Análisis**
(texto del análisis)

Nota: 3

**Justificación**
(texto)

Si el contenido queda corto, amplía con detalle del proyecto y del marco teórico sin inventar hechos.

No uses etiquetas <think>. Responde solo con la evaluación de esta subdimensión.`.trim();
}

async function collectStream(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens: number
): Promise<string> {
  let out = "";
  for await (const chunk of streamChat(messages, { max_tokens: maxTokens, useCase: "evaluate" })) {
    out += chunk;
  }
  return out;
}

type RagLlmPassParams = {
  evaluationTypeId: number;
  projectElementsTable: { element: string; content: string }[];
  ragQuery: string;
  evaluateDimension?: RubricDimension;
  evaluateSubdimension?: { dimensionName: string; name: string; content: string };
  userPrompt: string;
  maxTokens: number;
};

async function runRagLlmPass(params: RagLlmPassParams): Promise<string> {
  const systemContent = await buildSystemContext(params.evaluationTypeId, [], {
    projectElementsTable: params.projectElementsTable,
    projectElementsOnly: true,
    excludeReportFormat: true,
    contextMode: "evaluate",
    ragQuery: params.ragQuery,
    evaluateDimension: params.evaluateDimension,
    evaluateSubdimension: params.evaluateSubdimension,
  });

  const noThink =
    "Responde solo con el análisis de evaluación. No uses etiquetas <think>.\n\n";
  const systemMessage =
    noThink +
    (systemContent ||
      "Eres un evaluador de proyectos. Fundamenta el análisis en la rúbrica y el Manual de referencia.");

  return collectStream(
    [
      { role: "system", content: systemMessage },
      { role: "user", content: params.userPrompt },
    ],
    params.maxTokens
  );
}

function evaluationSummaryPrompt(overallScore: number | null): string {
  return `Redacta una SÍNTESIS FINAL DE LA EVALUACIÓN (máximo 300 caracteres).

REGLAS OBLIGATORIAS:
- NO describas el proyecto, su objetivo, beneficiarios ni actividades.
- Resume el VEREDICTO evaluativo según la rúbrica IGIP: hallazgos evaluativos y conclusión.
${overallScore != null ? `- Incluye la nota IGIP ponderada: ${overallScore}.` : "- Si puedes inferir la conclusión global, hazlo sin inventar una nota numérica."}
- Español claro, sin títulos, sin listas, sin markdown.
- Solo el texto de la síntesis evaluativa.`.trim();
}

async function generateEvaluationSummaryText(
  summaryInput: string,
  overallScore: number | null,
  schema: ReturnType<typeof buildRubricScoreSchema>,
  scores: Record<string, number | null>
): Promise<string> {
  let llmText = "";
  try {
    llmText = await collectStream(
      [
        {
          role: "system",
          content:
            "Eres evaluador IGIP. Escribes síntesis evaluativas concisas. NUNCA describas el proyecto, sus objetivos ni actividades. Solo veredicto evaluativo.",
        },
        {
          role: "user",
          content: `${evaluationSummaryPrompt(overallScore)}\n\nDatos de evaluación (solo notas y conclusiones):\n${summaryInput.slice(0, 6000)}`,
        },
      ],
      600
    );
  } catch {
    llmText = "";
  }
  return finalizeEvaluationSummary(llmText, schema, scores, overallScore);
}

function buildFormatSystemPrompt(
  reportFormat: string,
  rawEvaluation: string,
  limits: ReportFormatLimits
): string {
  return `Tu tarea es reorganizar el siguiente contenido de evaluación (análisis por dimensiones y subdimensiones) para presentarlo según la estructura y formato indicados.

## Formato que debe tener el informe final

${reportFormat}

## Tabla de longitudes (instrucción interna — NO imprimir en el informe)

${formatLimitsTable(limits)}

## Contenido de evaluación a reorganizar

${rawEvaluation}

Instrucciones:
- Presenta el contenido siguiendo las secciones y el orden del formato.
- Los números de caracteres son restricciones INTERNAS. PROHIBIDO incluir en el informe textos como "(500 caracteres)", "~500 caracteres", "1000 caracteres" o similares en títulos, subtítulos o cuerpo.
- Usa títulos limpios (ej. "2.1 Subdimensión Grado de originalidad de la idea", "Análisis", "Justificación", "Posibles mejoras") sin anotar longitudes.
- Cada bloque de texto debe acercarse a su longitud objetivo (entre 90% y 100% del límite). Si el análisis fuente es más corto, amplíalo con el mismo contenido ya evaluado; si es más largo, condensa sin perder la conclusión ni la nota.
- No inventes hechos nuevos sobre el proyecto; usa solo el texto del análisis.
- No uses etiquetas <think>. Responde únicamente con el informe ya formateado.`;
}

/**
 * Evaluación multi-nivel: RAG+LLM por análisis breve de dimensión y por cada subdimensión.
 */
export async function* runEvaluatePipeline(
  evaluationTypeId: number,
  projectElementsTable: { element: string; content: string }[],
  reportFormat: string
): AsyncGenerator<EvaluateStreamEvent, void, unknown> {
  const config = await getConfig(evaluationTypeId);
  if (!config) {
    yield { type: "error", error: "Configuración no encontrada" };
    return;
  }

  const rubricText = (config.rubric_prompt ?? "").trim();
  const dimensions = parseRubricDimensions(rubricText);
  const scoreSchema = buildRubricScoreSchema(rubricText);
  const subdimensionScores: Record<string, number | null> = {};
  const formatLimits = parseReportFormatLimits(reportFormat);
  const projectSummary = summarizeProjectForRag(projectElementsTable);
  const partialAnalyses: string[] = [];

  const totalSubdims = dimensions.reduce(
    (n, d) => n + parseRubricSubdimensions(d.content).length,
    0
  );

  yield {
    type: "step",
    message: `Evaluando proyecto: ${dimensions.length} dimensión(es), ${totalSubdims} subdimensión(es), con documentación de referencia…`,
  };

  for (let i = 0; i < dimensions.length; i++) {
    const dim = dimensions[i];
    const dimLimits = findDimensionLimits(formatLimits, dim.name);
    const overviewChars = dimLimits?.overview ?? 500;
    const subdims = parseRubricSubdimensions(dim.content);
    const dimSections: string[] = [`## Dimensión: ${dim.name}`];

    yield {
      type: "step",
      message: `Análisis breve — dimensión ${i + 1}/${dimensions.length}: ${dim.name}…`,
    };

    const overviewQuery = [
      dim.name,
      "análisis general dimensión evaluación innovación",
      dim.content.slice(0, 400),
      "Manual Oslo innovación marco teórico",
      projectSummary.slice(0, 600),
    ].join(" ");

    const overview = await runRagLlmPass({
      evaluationTypeId,
      projectElementsTable,
      ragQuery: overviewQuery,
      evaluateDimension: dim,
      userPrompt: dimensionOverviewPrompt(dim, overviewChars),
      maxTokens: 4000,
    });

    dimSections.push(`### Análisis breve\n\n${overview.trim()}`);
    yield { type: "dimension", name: dim.name, index: i + 1, total: dimensions.length };

    if (subdims.length > 0) {
      yield {
        type: "step",
        message: `Evaluando ${subdims.length} subdimensión(es) de ${dim.name} en paralelo…`,
      };
    }

    type SubdimResult = {
      j: number;
      sub: RubricSubdimension;
      subAnalysis: string;
      parsedScore: number | null;
    };

    const subdimResults = await Promise.all(
      subdims.map(async (sub, j): Promise<SubdimResult> => {
        const fieldLimits =
          findSubdimensionLimits(formatLimits, dim.name, sub.name) ?? {
            analysis: 500,
            justification: 500,
            improvements: 500,
          };

        const subQuery = [
          dim.name,
          sub.name,
          sub.content.slice(0, 800),
          "Manual Oslo innovación evaluación justificación mejoras",
          projectSummary.slice(0, 600),
        ].join(" ");

        const subAnalysis = await runRagLlmPass({
          evaluationTypeId,
          projectElementsTable,
          ragQuery: subQuery,
          evaluateSubdimension: {
            dimensionName: dim.name,
            name: sub.name,
            content: sub.content,
          },
          userPrompt: subdimensionUserPrompt(dim, sub, fieldLimits),
          maxTokens: 8000,
        });

        return {
          j,
          sub,
          subAnalysis,
          parsedScore: parseSubdimensionScore(subAnalysis),
        };
      })
    );

    subdimResults.sort((a, b) => a.j - b.j);

    for (const result of subdimResults) {
      dimSections.push(
        `### Subdimensión: ${result.sub.name}\n\n${result.subAnalysis.trim()}`
      );

      const scoreKey = subdimensionScoreKey(dim.name, result.sub.name);
      subdimensionScores[scoreKey] = result.parsedScore;

      yield {
        type: "subdimension",
        dimension: dim.name,
        name: result.sub.name,
        index: result.j + 1,
        total: subdims.length,
      };
    }

    partialAnalyses.push(dimSections.join("\n\n"));
  }

  const rawEvaluation = partialAnalyses.join("\n\n---\n\n");

  yield {
    type: "formatting",
    message: "Integrando análisis y organizando informe según formato…",
  };

  const formatSystem = buildFormatSystemPrompt(reportFormat, rawEvaluation, formatLimits);

  let formatted = "";
  for await (const chunk of streamChat(
    [
      { role: "system", content: formatSystem },
      {
        role: "user",
        content:
          "Reorganiza el contenido según el formato. No incluyas anotaciones de cantidad de caracteres en el informe. Ajusta cada sección a su longitud objetivo. Responde solo con el informe formateado.",
      },
    ],
    { max_tokens: 8192, useCase: "evaluate" }
  )) {
    formatted += chunk;
    if (chunk) {
      yield { type: "content", chunk };
    }
  }

  const sanitized = stripCharacterLimitAnnotations(formatted);

  yield {
    type: "step",
    message: "Extrayendo notas estructuradas (JSON) desde los análisis…",
  };

  const jsonScores = await extractSubdimensionScoresViaJson(
    scoreSchema,
    rawEvaluation,
    (messages) =>
      chatCompletion(messages, { max_tokens: 1024, temperature: 0.1, useCase: "evaluate" })
  );

  const regexBackfill = backfillSubdimensionScores(scoreSchema, {}, [
    rawEvaluation,
    sanitized,
  ]);

  Object.assign(
    subdimensionScores,
    mergeAuthoritativeScores(scoreSchema, jsonScores, [
      regexBackfill,
      subdimensionScores,
    ])
  );

  for (const entry of scoreSchema) {
    const score = subdimensionScores[entry.key];
    yield {
      type: "subdimension_score",
      dimension: entry.dimension,
      name: entry.name,
      score,
    };
  }

  const overallScore = computeWeightedIndicatorScore(scoreSchema, subdimensionScores);

  yield {
    type: "step",
    message: "Generando síntesis evaluativa final…",
  };

  const summaryInput = buildEvaluationInputForSummary(
    rawEvaluation,
    sanitized,
    scoreSchema,
    subdimensionScores
  );
  const evaluationSummary = await generateEvaluationSummaryText(
    summaryInput,
    overallScore,
    scoreSchema,
    subdimensionScores
  );

  const finalReport = injectAuthoritativeScoresSection(
    sanitized,
    scoreSchema,
    subdimensionScores,
    overallScore
  );
  yield { type: "report_content", content: finalReport };

  yield {
    type: "scores_summary",
    subdimensionScores: { ...subdimensionScores },
    overallScore,
  };
  yield { type: "evaluation_summary", text: evaluationSummary };

  yield { type: "done" };
}
