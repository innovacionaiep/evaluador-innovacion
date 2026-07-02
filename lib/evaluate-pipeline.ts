import { getConfig } from "@/lib/db";
import { buildSystemContext } from "@/lib/build-context";
import { streamChat } from "@/lib/openrouter";
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
2. **Nota** — valor 1, 2, 3 o 4 según la rúbrica (puede ser breve, ej. "Nota: 3")
3. **Justificación** — entre ${j.min} y ${j.max} caracteres
4. **Posibles mejoras** — entre ${m.min} y ${m.max} caracteres

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

    for (let j = 0; j < subdims.length; j++) {
      const sub = subdims[j];
      yield {
        type: "step",
        message: `Subdimensión ${j + 1}/${subdims.length} de ${dim.name}: ${sub.name}…`,
      };

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

      dimSections.push(`### Subdimensión: ${sub.name}\n\n${subAnalysis.trim()}`);
      yield {
        type: "subdimension",
        dimension: dim.name,
        name: sub.name,
        index: j + 1,
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
  }

  const sanitized = stripCharacterLimitAnnotations(formatted);
  if (sanitized) {
    yield { type: "content", chunk: sanitized };
  }

  yield { type: "done" };
}
