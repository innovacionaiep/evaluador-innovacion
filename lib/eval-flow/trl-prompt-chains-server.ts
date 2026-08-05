import "server-only";

import { getConfig } from "@/lib/db";
import { getEvaluationTypeByIdPostgres } from "@/lib/db-postgres";
import { getEvaluationConfig } from "@/lib/evaluation-config-server";
import { getEvaluationTypeSettings } from "@/lib/evaluation-type-settings-server";
import { isTrl } from "@/lib/eval-types/constants";
import {
  DEFAULT_EXTRACT_SYSTEM_PROMPT,
  DEFAULT_TRL_EVAL_USER_PROMPT,
} from "@/lib/eval-types/prompt-defaults";
import {
  DEFAULT_GANTT_STRUCTURE_PROMPT_IGIP,
  DEFAULT_INDICATORS_STRUCTURE_PROMPT_IGIP,
} from "@/lib/eval-types/extract-config-defaults";
import {
  mergeRubricConfig,
  type RubricConfigTrl,
} from "@/lib/rubric-config";
import {
  mergeReportFormatConfig,
  compileReportFormatToLegacyText,
  isReportFormatValid,
} from "@/lib/report-format-config";
import { mainLevelsRubricText } from "@/lib/rubric-niveles";
import {
  buildEvaluateSystemStructureDoc,
  EVALUATE_SYSTEM_RELATED_CONFIG_ACTIONS,
} from "./evaluate-system-structure-doc";
import { buildEvaluateSystemAssemblyFlow } from "./evaluate-system-assembly-flow";
import {
  buildEvaluateSystemMessageNode,
  buildEvaluateUserMessageNode,
  EVALUATE_LLM_CHAIN_HINT,
  previewUserMessageWithOrientation,
} from "./evaluate-llm-chain-builders";
import { FALLBACK_SUMMARY_SYSTEM_PROMPT } from "@/lib/system-prompts-catalog";
import {
  buildReportAssemblySequence,
  perSectionLlmRepeatLabel,
} from "./report-assembly-sequence";
import {
  chainNode,
  type IgipFlowPromptChainsResponse,
  type IgipFlowStepPrompts,
  type IgipPromptChain,
} from "./igip-prompt-chains-types";

export async function buildTrlFlowPromptChains(
  evaluationTypeId: number
): Promise<IgipFlowPromptChainsResponse | null> {
  const typeRow = await getEvaluationTypeByIdPostgres(evaluationTypeId);
  if (!typeRow || !isTrl(typeRow.name)) return null;

  const [config, typeSettings, evaluation] = await Promise.all([
    getConfig(evaluationTypeId),
    getEvaluationTypeSettings(evaluationTypeId),
    getEvaluationConfig(evaluationTypeId),
  ]);

  const rubric = mergeRubricConfig(
    config ? JSON.parse(config.rubric_config || "{}") : undefined,
    "TRL"
  ) as RubricConfigTrl;
  const reportFormat = mergeReportFormatConfig(
    config ? JSON.parse(config.report_format_config || "{}") : undefined,
    rubric
  );
  const extract = typeSettings.extract;
  const elementsList = config ? JSON.parse(config.elements || "[]") : [];

  const extractSystem =
    extract.prompts?.system?.trim() || DEFAULT_EXTRACT_SYSTEM_PROMPT;
  const ganttPrompt =
    extract.structurePrompts?.gantt?.trim() || DEFAULT_GANTT_STRUCTURE_PROMPT_IGIP;
  const indicatorsPrompt =
    extract.structurePrompts?.indicators?.trim() ||
    DEFAULT_INDICATORS_STRUCTURE_PROMPT_IGIP;

  const extractChains: IgipPromptChain[] = [
    {
      id: "extract-agent",
      title: "Extracción por elemento (igual que IGIP)",
      repeatLabel: "× N elementos",
      nodes: [
        chainNode(
          1,
          "system",
          "System extracción",
          "Prompt de sistema del agente extractor",
          extractSystem,
          "código",
          "extract-basic"
        ),
        chainNode(
          2,
          "user",
          "User por elemento",
          "Plantilla user con título/sección/descripción",
          extract.agent?.userPromptTemplate || "[plantilla user extract]",
          "configuración",
          "extract-basic"
        ),
      ],
    },
    {
      id: "extract-structure",
      title: "Estructura Gantt / Indicadores",
      nodes: [
        chainNode(
          1,
          "system",
          "Gantt",
          "Estructura de actividades",
          ganttPrompt,
          "código",
          "extract-advanced"
        ),
        chainNode(
          2,
          "system",
          "Indicadores",
          "Estructura de indicadores",
          indicatorsPrompt,
          "código",
          "extract-advanced"
        ),
      ],
    },
  ];

  const mainScale = mainLevelsRubricText(rubric.levels);
  const levelNumbers = rubric.levels.map((l) => l.level).join(", ") || "(sin niveles)";

  const reportFormatPreview = isReportFormatValid(reportFormat, rubric)
    ? compileReportFormatToLegacyText(reportFormat, rubric)
    : undefined;

  const assemblyFlow = buildEvaluateSystemAssemblyFlow({
    focusLabel: "nivel TRL",
    focusTitle: "Nivel TRL",
    focusSnippet: mainScale || "[Niveles TRL]",
    elementsList,
    rubric,
    evaluation,
    reportFormatPreview,
  });

  const systemPreview = buildEvaluateSystemStructureDoc({
    focusLabel: "nivel TRL",
    focusSnippet: mainScale || "[Niveles TRL]",
    knowledgeLabel: evaluation.knowledgeReferenceLabel,
    projectElementsInRagQuery: evaluation.projectElementsInRagQuery,
    ragEvaluate: evaluation.ragEvaluate,
  });

  const evaluateChains: IgipPromptChain[] = [
    {
      id: "trl-eval",
      title: "Evaluación TRL (única)",
      hint: EVALUATE_LLM_CHAIN_HINT,
      nodes: [
        buildEvaluateSystemMessageNode({
          order: 1,
          systemPreview,
          assemblyFlow,
          relatedConfigActionIds: EVALUATE_SYSTEM_RELATED_CONFIG_ACTIONS,
        }),
        buildEvaluateUserMessageNode({
          order: 2,
          focusLabel: "nivel TRL",
          template: evaluation.prompts.trlEval?.trim() || DEFAULT_TRL_EVAL_USER_PROMPT,
          templateSource: evaluation.prompts.trlEval?.trim() ? "configuración" : "código",
          orientation: evaluation.phaseInstructions.subdimensionEval?.trim() ?? "",
          userPreview: previewUserMessageWithOrientation(
            evaluation.prompts.trlEval?.trim() || DEFAULT_TRL_EVAL_USER_PROMPT,
            evaluation.phaseInstructions.subdimensionEval?.trim() ?? "",
            {
              mainScale: mainScale || "[Escala TRL]",
              knowledgeLabel: evaluation.knowledgeReferenceLabel,
              levelNumbers,
            }
          ),
        }),
      ],
    },
  ];

  const assemblySequence = buildReportAssemblySequence(rubric, reportFormat);
  const reportChains: IgipPromptChain[] = [
    {
      id: "report-assembly",
      title: "Ensamblado del informe TRL",
      repeatLabel: perSectionLlmRepeatLabel(rubric, reportFormat),
      nodes: [
        chainNode(
          1,
          "context",
          "Secuencia de secciones",
          "Resumen LLM → Evaluación verbatim → Nivel TRL:N → Síntesis LLM",
          assemblySequence.map((s) => `${s.order}. ${s.title} (${s.methodLabel})`).join("\n"),
          "código",
          "report-structure"
        ),
        chainNode(
          2,
          "system",
          "Síntesis final (fallback)",
          "Prompt de síntesis evaluativa",
          FALLBACK_SUMMARY_SYSTEM_PROMPT("TRL"),
          "código",
          "report-prompts"
        ),
      ],
    },
  ];

  const steps: IgipFlowStepPrompts[] = [
    { stepId: "extract", chains: extractChains },
    { stepId: "evaluate", chains: evaluateChains },
    { stepId: "report", chains: reportChains, assemblySequence },
  ];

  return {
    generatedAt: new Date().toISOString(),
    evaluationTypeId,
    steps,
  };
}
