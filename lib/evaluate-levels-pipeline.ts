import { getConfig } from "@/lib/db";
import { getEvaluationTypeByIdPostgres } from "@/lib/db-postgres";
import { streamChat } from "@/lib/openrouter";
import { getEvaluationConfig } from "@/lib/evaluation-config-server";
import type { EvaluationConfig } from "@/lib/evaluation-config";
import { resolveRagIncludeDocNames } from "@/lib/evaluation-config";
import { getGlobalLlmSemaphore, type EvaluateLlmSemaphore } from "@/lib/evaluate-concurrency";
import { assembleFinalNivelesReportEvents } from "@/lib/assemble-final-report";
import {
  enrichReportFormatWithLegacySections,
  isReportFormatValid,
  mergeReportFormatConfig,
} from "@/lib/report-format-config";
import { stripCharacterLimitAnnotations } from "@/lib/report-format-limits";
import { sanitizeLlmEvaluationText } from "@/lib/llm-output-sanitize";
import { buildSubdimensionKnowledgeQuery } from "@/lib/evaluate-rag-query";
import {
  buildRubricScoreSchemaFromConfig,
  isRubricConfigValid,
  mergeRubricConfig,
  type RubricConfigNiveles,
  type RubricVariableConfig,
} from "@/lib/rubric-config";
import {
  computeAverageLevel,
  hasRubricVariables,
  mainLevelsRubricText,
  parseAssignedLevel,
  validLevelNumbers,
  validLevelNumbersForVariable,
  variableEvalContent,
  variableLevelKey,
} from "@/lib/rubric-niveles";
import { buildEvaluationScoresPayload } from "@/lib/evaluation-scores";
import type { RetrievedChunk } from "@/lib/chunk-types";
import type { EvaluateStreamEvent } from "@/lib/evaluate-pipeline";
import {
  applyPromptTemplate,
  DEFAULT_ASSIGN_LEVEL_USER_PROMPT,
  DEFAULT_VARIABLE_EVAL_USER_PROMPT,
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

type RagPassParams = {
  evaluationTypeId: number;
  projectElementsTable: { element: string; content: string }[];
  ragQuery: string;
  evaluateSubdimension?: { dimensionName: string; name: string; content: string };
  userPrompt: string;
  maxTokens: number;
  knowledgeLabel: string;
  semaphore?: EvaluateLlmSemaphore;
  precomputedKnowledgeChunks?: RetrievedChunk[];
  subdimensionLabel: string;
  includeDocNames?: string[] | null;
};

async function runRagLlmPass(params: RagPassParams): Promise<string> {
  validateProjectElementsForEvaluation(params.projectElementsTable);

  const systemMessage = await resolveEvaluateSystemContextWithRetry({
    evaluationTypeId: params.evaluationTypeId,
    projectElementsTable: params.projectElementsTable,
    ragQuery: params.ragQuery,
    evaluateSubdimension: params.evaluateSubdimension,
    precomputedKnowledgeChunks: params.precomputedKnowledgeChunks,
    subdimensionLabel: params.subdimensionLabel,
    includeDocNames: params.includeDocNames ?? null,
  });

  return collectStream(
    [
      { role: "system", content: systemMessage },
      { role: "user", content: params.userPrompt },
    ],
    params.maxTokens,
    params.semaphore
  );
}

function assignLevelPrompt(rubric: RubricConfigNiveles, evaluation: EvaluationConfig): string {
  const nums = validLevelNumbers(rubric).join(", ");
  const label = evaluation.knowledgeReferenceLabel;
  const phase = evaluation.phaseInstructions.assignedLevel.trim();
  const mainScale = mainLevelsRubricText(rubric.levels);
  const phaseBlock = phase ? `\n\nOrientación adicional:\n${phase}` : "";
  const template = evaluation.prompts.assignLevel?.trim() || DEFAULT_ASSIGN_LEVEL_USER_PROMPT;
  return applyPromptTemplate(template, {
    mainScale,
    knowledgeLabel: label,
    levelNumbers: nums,
    phaseInstructions: phaseBlock,
  });
}

function variableEvalPrompt(
  variable: RubricVariableConfig,
  evaluation: EvaluationConfig
): string {
  const nums = validLevelNumbersForVariable(variable).join(", ");
  const label = evaluation.knowledgeReferenceLabel;
  const phaseBlock = formatOptionalPhaseInstructions(evaluation.phaseInstructions.subdimensionEval);
  const template = evaluation.prompts.variableEval?.trim() || DEFAULT_VARIABLE_EVAL_USER_PROMPT;
  return applyPromptTemplate(template, {
    variable: variable.name,
    levelNumbers: nums,
    knowledgeLabel: label,
    phaseInstructions: phaseBlock,
  });
}

type VariableEvalResult = {
  index: number;
  variable: RubricVariableConfig;
  analysis: string;
  level: number | null;
};

async function evaluateVariables(
  rubric: RubricConfigNiveles,
  evaluation: EvaluationConfig,
  evaluationTypeId: number,
  projectElementsTable: { element: string; content: string }[],
  semaphore: EvaluateLlmSemaphore,
  precomputedChunks?: Record<string, RetrievedChunk[]>,
  onEvent?: (event: EvaluateStreamEvent) => void
): Promise<VariableEvalResult[]> {
  const total = rubric.variables.length;
  const topN = evaluation.projectElementsInRagQuery;

  const runOne = async (variable: RubricVariableConfig, index: number): Promise<VariableEvalResult> => {
    const content = variableEvalContent(variable);
    const dim = { name: "Variables", content };
    const sub = { name: variable.name, content };
    const ragQuery = buildSubdimensionKnowledgeQuery(dim, sub, projectElementsTable, topN);
    const key = variableLevelKey(variable.name);
    const validLevels = validLevelNumbersForVariable(variable);

    const analysis = await runRagLlmPass({
      evaluationTypeId,
      projectElementsTable,
      ragQuery,
      evaluateSubdimension: {
        dimensionName: "Variables",
        name: variable.name,
        content,
      },
      userPrompt: variableEvalPrompt(variable, evaluation),
      maxTokens: evaluation.maxTokens.subdimension,
      knowledgeLabel: evaluation.knowledgeReferenceLabel,
      semaphore,
      precomputedKnowledgeChunks: precomputedChunks?.[key],
      subdimensionLabel: `variable ${variable.name}`,
      includeDocNames: resolveRagIncludeDocNames(evaluation.ragEvaluate, key) ?? null,
    });

    const level = parseAssignedLevel(analysis, validLevels);
    onEvent?.({
      type: "subdimension",
      dimension: "Variables",
      name: variable.name,
      index: index + 1,
      total,
    });
    onEvent?.({
      type: "variable_level",
      name: variable.name,
      level,
      index: index + 1,
      total,
    });

    return { index, variable, analysis, level };
  };

  const results = evaluation.parallelSubdimensions
    ? await Promise.all(rubric.variables.map((v, i) => runOne(v, i)))
    : await (async () => {
        const out: VariableEvalResult[] = [];
        for (let i = 0; i < rubric.variables.length; i++) {
          out.push(await runOne(rubric.variables[i], i));
        }
        return out;
      })();

  results.sort((a, b) => a.index - b.index);
  return results;
}

function buildRawEvaluationFromVariables(variableResults: VariableEvalResult[]): string {
  return variableResults
    .map((r) => `### Variable: ${r.variable.name}\n\n${r.analysis.trim()}`)
    .join("\n\n");
}

/**
 * Evaluación por niveles (IMET): por variables (JSON de subnivel) + promedio; informe desde §6.
 */
export async function* runEvaluateLevelsPipeline(
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

  if (rubric.type !== "niveles" || !isRubricConfigValid(rubric)) {
    yield { type: "error", error: "Rúbrica de niveles no configurada correctamente" };
    return;
  }
  if (!isReportFormatValid(reportFormat, rubric)) {
    yield { type: "error", error: "Formato de informe (§6) incompleto" };
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
  const levelNums = validLevelNumbers(rubric);
  const indicatorLabel = evaluation.indicatorLabel || "IMET";

  let rawEvaluation: string;
  let assignedLevel: number | null = null;
  let levelTitle = "";
  let variableScores: Record<string, number | null> = {};
  let overallScore: number | null = null;

  if (hasRubricVariables(rubric)) {
    yield {
      type: "step",
      message: `Evaluando ${rubric.variables.length} variable(s)…`,
    };

    const eventQueue: EvaluateStreamEvent[] = [];
    const variableResults = await evaluateVariables(
      rubric,
      evaluation,
      evaluationTypeId,
      projectElementsTable,
      semaphore,
      options?.precomputedSubdimensionChunks,
      (e) => eventQueue.push(e)
    );
    for (const e of eventQueue) yield e;

    rawEvaluation = buildRawEvaluationFromVariables(variableResults);

    for (const r of variableResults) {
      variableScores[variableLevelKey(r.variable.name)] = r.level;
    }
    overallScore = computeAverageLevel(variableResults.map((r) => r.level));

    const scoreSchema = buildRubricScoreSchemaFromConfig(rubric);
    const evaluationScoresPayload = buildEvaluationScoresPayload(
      scoreSchema,
      variableScores,
      indicatorLabel
    );
    evaluationScoresPayload.overallScore = overallScore;

    yield {
      type: "evaluation_scores",
      payload: evaluationScoresPayload,
    };
  } else {
    yield { type: "step", message: "Evaluando nivel global del proyecto…" };

    const rubricText = mainLevelsRubricText(rubric.levels);
    rawEvaluation = await runRagLlmPass({
      evaluationTypeId,
      projectElementsTable,
      ragQuery: [rubricText.slice(0, 800), projectElementsTable.map((r) => r.element).join(" ")]
        .filter(Boolean)
        .join(" "),
      evaluateSubdimension: {
        dimensionName: "Nivel global",
        name: "Asignación de nivel",
        content: rubricText,
      },
      userPrompt: assignLevelPrompt(rubric, evaluation),
      maxTokens: evaluation.maxTokens.subdimension,
      knowledgeLabel: evaluation.knowledgeReferenceLabel,
      subdimensionLabel: "nivel global",
      includeDocNames: resolveRagIncludeDocNames(evaluation.ragEvaluate, "nivel-global") ?? null,
    });

    assignedLevel = parseAssignedLevel(rawEvaluation, levelNums);
    const levelMeta = rubric.levels.find((l) => l.level === assignedLevel);
    levelTitle = levelMeta?.title ?? "";

    yield {
      type: "assigned_level" as const,
      level: assignedLevel,
      title: levelTitle,
    };
  }

  yield { type: "formatting", message: "Informe final: integrando evaluación y redactando secciones con IA…" };

  yield {
    type: "report_draft",
    content: stripCharacterLimitAnnotations(rawEvaluation),
  };

  let assembled: { finalReport: string; evaluationSummary: string } | undefined;

  for await (const event of assembleFinalNivelesReportEvents({
    rubric,
    reportFormat,
    rawEvaluation,
    projectElementsTable,
    evaluation,
    assignedLevel,
    levelTitle,
    subdimensionScores: variableScores,
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

  if (hasRubricVariables(rubric)) {
    yield {
      type: "scores_summary",
      subdimensionScores: { ...variableScores },
      overallScore,
    };
  }

  yield { type: "done" };
}
