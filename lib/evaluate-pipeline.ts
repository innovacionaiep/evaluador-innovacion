import { getConfig } from "@/lib/db";
import { buildSystemContext } from "@/lib/build-context";
import { streamChat } from "@/lib/openrouter";
import {
  parseRubricDimensions,
  summarizeProjectForRag,
  type RubricDimension,
} from "@/lib/rubric-dimensions";

export type EvaluateStreamEvent =
  | { type: "step"; message: string }
  | { type: "content"; chunk: string }
  | { type: "done" }
  | { type: "error"; error: string };

function dimensionUserPrompt(dimension: RubricDimension): string {
  return `Realiza un análisis de evaluación técnico y exhaustivo del proyecto para la dimensión "${dimension.name}".

Usa ÚNICAMENTE:
- Los elementos identificados del proyecto en "Documentos del proyecto a evaluar".
- Los fragmentos del Manual de referencia (Knowledge) incluidos en el contexto.
- Los criterios de la dimensión indicados en "Enfoque de esta evaluación parcial".

Incluye notas por subcriterio, justificaciones con referencia al marco teórico cuando aplique, y posibles mejoras.
No uses etiquetas <think>. Responde solo con el análisis de esta dimensión, sin introducciones genéricas.`.trim();
}

async function collectStream(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens: number
): Promise<string> {
  let out = "";
  for await (const chunk of streamChat(messages, { max_tokens: maxTokens })) {
    out += chunk;
  }
  return out;
}

/**
 * Evaluación multi-dimensión: una pasada RAG+LLM por dimensión de rúbrica, luego fusión y formateo.
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
  const projectSummary = summarizeProjectForRag(projectElementsTable);
  const usedChunkIds = new Set<string>();
  const partialAnalyses: string[] = [];

  yield {
    type: "step",
    message: `Evaluando proyecto en ${dimensions.length} dimensión(es) con documentación de referencia…`,
  };

  for (let i = 0; i < dimensions.length; i++) {
    const dim = dimensions[i];
    yield {
      type: "step",
      message: `Analizando dimensión ${i + 1}/${dimensions.length}: ${dim.name}…`,
    };

    const ragQuery = [
      dim.name,
      dim.content.slice(0, 800),
      "Manual Oslo innovación evaluación marco teórico",
      projectSummary.slice(0, 600),
    ].join(" ");

    const systemContent = await buildSystemContext(evaluationTypeId, [], {
      projectElementsTable,
      projectElementsOnly: true,
      excludeReportFormat: true,
      contextMode: "evaluate",
      ragQuery,
      excludeChunkIds: usedChunkIds.size > 0 ? new Set(usedChunkIds) : undefined,
      evaluateDimension: dim,
      onRetrievedChunks: (chunks) => {
        for (const c of chunks) usedChunkIds.add(c.id);
      },
    });

    const noThink =
      "Responde solo con el análisis de evaluación. No uses etiquetas <think>.\n\n";
    const systemMessage =
      noThink +
      (systemContent ||
        "Eres un evaluador de proyectos. Fundamenta el análisis en la rúbrica y el Manual de referencia.");

    const analysis = await collectStream(
      [
        { role: "system", content: systemMessage },
        { role: "user", content: dimensionUserPrompt(dim) },
      ],
      12000
    );

    partialAnalyses.push(`## Dimensión: ${dim.name}\n\n${analysis.trim()}`);
  }

  const rawEvaluation = partialAnalyses.join("\n\n---\n\n");

  yield { type: "step", message: "Integrando análisis y organizando informe según formato…" };

  const formatSystem = `Tu tarea es reorganizar el siguiente contenido de evaluación (análisis técnico por dimensiones) para presentarlo según la estructura y formato indicados.

## Formato que debe tener el informe final

${reportFormat}

## Contenido de evaluación a reorganizar

${rawEvaluation}

Instrucciones: presenta el contenido anterior siguiendo exactamente las secciones y el orden del formato. No inventes contenido nuevo; usa solo el texto del análisis. No uses etiquetas <think>. Responde únicamente con el informe ya formateado.`;

  for await (const chunk of streamChat(
    [
      { role: "system", content: formatSystem },
      {
        role: "user",
        content:
          "Reorganiza el contenido de evaluación anterior según el formato indicado. Responde solo con el informe formateado.",
      },
    ],
    { max_tokens: 8192 }
  )) {
    yield { type: "content", chunk };
  }

  yield { type: "done" };
}
