import { getConfig } from "@/lib/db";
import { getEvaluationTypeByIdPostgres } from "@/lib/db-postgres";
import { streamChat } from "@/lib/openrouter";
import { getEvaluationConfig } from "@/lib/evaluation-config-server";
import type { EvaluationConfig } from "@/lib/evaluation-config";
import { resolveRagIncludeDocNames } from "@/lib/evaluation-config";
import { getGlobalLlmSemaphore, type EvaluateLlmSemaphore } from "@/lib/evaluate-concurrency";
import { assembleFinalTrlReportEvents } from "@/lib/assemble-final-report";
import {
  enrichReportFormatWithLegacySections,
  isReportFormatValid,
  mergeReportFormatConfig,
} from "@/lib/report-format-config";
import { stripCharacterLimitAnnotations } from "@/lib/report-format-limits";
import { sanitizeLlmEvaluationText } from "@/lib/llm-output-sanitize";
import {
  buildRubricScoreSchemaFromConfig,
  isRubricConfigValid,
  mergeRubricConfig,
  TRL_LEVEL_SCORE_KEY,
  type RubricConfigTrl,
} from "@/lib/rubric-config";
import { mainLevelsRubricText, parseAssignedLevel } from "@/lib/rubric-niveles";
import { buildEvaluationScoresPayload } from "@/lib/evaluation-scores";
import type { RetrievedChunk } from "@/lib/chunk-types";
import type { EvaluateStreamEvent } from "@/lib/evaluate-pipeline";
import {
  applyPromptTemplate,
  DEFAULT_TRL_EVAL_USER_PROMPT,
  formatOptionalPhaseInstructions,
} from "@/lib/eval-types/prompt-defaults";
import { resolveEvaluateSystemContextWithRetry } from "@/lib/resolve-evaluate-system-context";
import { validateProjectElementsForEvaluation } from "@/lib/evaluate-system-context-strict";

async function collectStream(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens: number,
  semaphore?: EvaluateLlmSemaphore
): Promise<string> {
  const run = async () => {
    let out = "";
    for await (const chunk of streamChat(messages, { max_tokens: maxTokens, useCase: "evaluate" })) {
      out += chunk;
    }
    return sanitizeLlmEvaluationText(out);
  };
  return semaphore ? semaphore.run(run) : run();
}

function trlEvalPrompt(rubric: RubricConfigTrl, evaluation: EvaluationConfig): string {
  const nums = rubric.levels.map((l) => l.level).join(", ");
  const label = evaluation.knowledgeReferenceLabel;
  const phaseBlock = formatOptionalPhaseInstructions(evaluation.phaseInstructions.subdimensionEval);
  const mainScale = mainLevelsRubricText(rubric.levels);
  const template = evaluation.prompts.trlEval?.trim() || DEFAULT_TRL_EVAL_USER_PROMPT;
  return applyPromptTemplate(template, {
    mainScale,
    knowledgeLabel: label,
    levelNumbers: nums,
    phaseInstructions: phaseBlock,
  });
}

/**
 * Evaluación TRL: una sola clasificación en un nivel de la rúbrica + informe §6.
 */
export async function* runEvaluateTrlPipeline(
  evaluationTypeId: number,
  projectElementsTable: { element: string; content: string }[],
  options?: { precomputedSubdimensionChunks?: Record<string, RetrievedChunk[]> }
): AsyncGenerator<EvaluateStreamEvent, void, unknown> {
  const config = await getConfig(evaluationTypeId);
  if (!config) {
    yield { type: "error", error: "Configuración no encontrada" };
    return;
  }

  const typeRow = await getEvaluationTypeByIdPostgres(evaluationTypeId);
  const rubric = mergeRubricConfig(JSON.parse(config.rubric_config || "{}"), typeRow?.name);
  const evaluation = await getEvaluationConfig(evaluationTypeId);
  const reportFormat = enrichReportFormatWithLegacySections(
    mergeReportFormatConfig(JSON.parse(config.report_format_config || "{}"), rubric),
    rubric,
    (config.report_format ?? "").trim()
  );

  if (rubric.type !== "trl" || !isRubricConfigValid(rubric)) {
    yield {
      type: "error",
      error:
        "Rúbrica TRL no configurada. Agrega al menos un nivel en Configuración → Rúbrica de niveles TRL.",
    };
    return;
  }
  if (!isReportFormatValid(reportFormat, rubric)) {
    yield { type: "error", error: "Formato de informe incompleto" };
    return;
  }

  try {
    validateProjectElementsForEvaluation(projectElementsTable);
  } catch (err) {
    yield {
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    };
    return;
  }

  const semaphore = getGlobalLlmSemaphore();
  const levelNums = rubric.levels.map((l) => l.level);
  const indicatorLabel = evaluation.indicatorLabel || "TRL";
  const rubricText = mainLevelsRubricText(rubric.levels);

  yield { type: "step", message: "Evaluando nivel TRL del proyecto…" };

  const systemMessage = await resolveEvaluateSystemContextWithRetry({
    evaluationTypeId,
    projectElementsTable,
    ragQuery: [rubricText.slice(0, 800), projectElementsTable.map((r) => r.element).join(" ")]
      .filter(Boolean)
      .join(" "),
    evaluateSubdimension: {
      dimensionName: "TRL",
      name: "Nivel TRL",
      content: rubricText,
    },
    subdimensionLabel: "nivel TRL",
    includeDocNames: resolveRagIncludeDocNames(evaluation.ragEvaluate, TRL_LEVEL_SCORE_KEY) ?? null,
    precomputedKnowledgeChunks:
      options?.precomputedSubdimensionChunks?.[TRL_LEVEL_SCORE_KEY] ??
      options?.precomputedSubdimensionChunks?.["Nivel TRL"] ??
      undefined,
  });

  const rawEvaluation = await collectStream(
    [
      { role: "system", content: systemMessage },
      { role: "user", content: trlEvalPrompt(rubric, evaluation) },
    ],
    evaluation.maxTokens.subdimension,
    semaphore
  );

  if (!rawEvaluation.trim()) {
    yield {
      type: "error",
      error:
        "La evaluación TRL no devolvió texto. Reintente; si persiste, revise el modelo LLM de evaluación.",
    };
    return;
  }

  let assignedLevel = parseAssignedLevel(rawEvaluation, levelNums);
  if (assignedLevel == null) {
    // Segundo intento: pedir solo la línea Nivel: N (modelos que escriben **Nivel:** 2 u omiten el formato).
    const clarify = await collectStream(
      [
        { role: "system", content: systemMessage },
        {
          role: "user",
          content: [
            "A partir de esta evaluación, responde SOLO con una línea exacta del formato Nivel: N",
            `donde N es uno de: ${levelNums.join(", ")}. Sin negritas ni texto extra.`,
            "",
            rawEvaluation.slice(0, 6000),
          ].join("\n"),
        },
      ],
      64,
      semaphore
    );
    assignedLevel =
      parseAssignedLevel(clarify, levelNums) ??
      parseAssignedLevel(rawEvaluation, levelNums);
  }

  if (assignedLevel == null) {
    yield {
      type: "error",
      error: `No se pudo leer el nivel TRL (se esperaba una línea «Nivel: N» con N ∈ ${levelNums.join(", ")}). Reintente la evaluación.`,
    };
    return;
  }

  const levelMeta = rubric.levels.find((l) => l.level === assignedLevel);
  const levelTitle = levelMeta?.title ?? "";
  const overallScore = assignedLevel;
  const subdimensionScores: Record<string, number | null> = {
    [TRL_LEVEL_SCORE_KEY]: assignedLevel,
  };

  const scoreSchema = buildRubricScoreSchemaFromConfig(rubric);
  const evaluationScoresPayload = buildEvaluationScoresPayload(
    scoreSchema,
    subdimensionScores,
    indicatorLabel
  );
  evaluationScoresPayload.overallScore = overallScore;

  yield {
    type: "evaluation_scores",
    payload: evaluationScoresPayload,
  };

  yield {
    type: "assigned_level" as const,
    level: assignedLevel,
    title: levelTitle,
  };

  yield { type: "formatting", message: "Informe final: integrando evaluación y redactando secciones con IA…" };

  yield {
    type: "report_draft",
    content: stripCharacterLimitAnnotations(rawEvaluation),
  };

  let assembled: { finalReport: string; evaluationSummary: string } | undefined;

  for await (const event of assembleFinalTrlReportEvents({
    rubric,
    reportFormat,
    rawEvaluation,
    projectElementsTable,
    evaluation,
    assignedLevel,
    levelTitle,
    subdimensionScores,
    overallScore,
  })) {
    if (event.type === "step") {
      yield { type: "step", message: event.message };
    } else {
      assembled = event.result;
    }
  }

  if (!assembled) {
    throw new Error("El ensamblado del informe no produjo resultado.");
  }

  if (assembled.evaluationSummary.trim()) {
    yield {
      type: "evaluation_summary",
      text: assembled.evaluationSummary,
    };
  }

  yield { type: "report_content", content: assembled.finalReport };

  yield {
    type: "scores_summary",
    subdimensionScores: { ...subdimensionScores },
    overallScore,
  };

  yield { type: "done" };
}
