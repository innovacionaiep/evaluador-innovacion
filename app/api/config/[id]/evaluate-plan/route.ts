import { NextResponse } from "next/server";
import { getConfig, getEvaluationTypeById } from "@/lib/db";
import { getEvaluationConfig } from "@/lib/evaluation-config-server";
import {
  normalizeRagIncludeDocNames,
  resolveRagIncludeDocNames,
} from "@/lib/evaluation-config";
import {
  mergeRubricConfig,
  subdimensionEvalContent,
  buildRubricScoreSchemaFromConfig,
  type RubricConfigNiveles,
} from "@/lib/rubric-config";
import {
  hasRubricVariables,
  mainLevelsRubricText,
  variableEvalContent,
  variableLevelKey,
} from "@/lib/rubric-niveles";
import { CONTEXT_LIMITS, applyEvaluateRagOverrides } from "@/lib/rag-limits";

function ragEvaluatePayload(
  ragLimits: { topK: number; maxRetrievedChars: number },
  includeDocNames: string[] | undefined
) {
  return {
    topK: ragLimits.topK,
    maxRetrievedChars: ragLimits.maxRetrievedChars,
    ...(includeDocNames ? { includeDocNames } : {}),
  };
}

function withResolvedDocs<T extends { key: string }>(
  items: T[],
  ragEvaluate: Parameters<typeof resolveRagIncludeDocNames>[0]
): Array<T & { includeDocNames?: string[] }> {
  return items.map((item) => {
    const docs = resolveRagIncludeDocNames(ragEvaluate, item.key);
    return docs?.length ? { ...item, includeDocNames: docs } : { ...item };
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const type = await getEvaluationTypeById(id);
    const config = await getConfig(id);
    if (!type || !config) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rubric = mergeRubricConfig(JSON.parse(config.rubric_config || "{}"), type.name);
    const evaluation = await getEvaluationConfig(id);
    const ragLimits = applyEvaluateRagOverrides(
      CONTEXT_LIMITS.evaluate,
      evaluation.ragEvaluate
    );
    const globalDocs = normalizeRagIncludeDocNames(evaluation.ragEvaluate.includeDocNames);
    const ragEvaluate = ragEvaluatePayload(ragLimits, globalDocs);

    if (rubric.type === "niveles") {
      const niveles = rubric as RubricConfigNiveles;

      if (hasRubricVariables(niveles)) {
        const subdimensions = withResolvedDocs(
          niveles.variables.map((variable) => ({
            key: variableLevelKey(variable.name),
            dimension: "Variables",
            name: variable.name,
            rubricContent: variableEvalContent(variable),
          })),
          evaluation.ragEvaluate
        );

        return NextResponse.json({
          rubricType: "niveles",
          subdimensions,
          ragEvaluate,
          knowledgeReferenceLabel: evaluation.knowledgeReferenceLabel,
          projectElementsInRagQuery: evaluation.projectElementsInRagQuery,
        });
      }

      const rubricText = mainLevelsRubricText(niveles.levels);
      const subdimensions = withResolvedDocs(
        [
          {
            key: "nivel-global",
            dimension: "Nivel global",
            name: "Asignación de nivel",
            rubricContent: rubricText,
          },
        ],
        evaluation.ragEvaluate
      );

      return NextResponse.json({
        rubricType: "niveles",
        subdimensions,
        ragEvaluate,
        knowledgeReferenceLabel: evaluation.knowledgeReferenceLabel,
        projectElementsInRagQuery: evaluation.projectElementsInRagQuery,
      });
    }

    if (rubric.type !== "ponderaciones") {
      return NextResponse.json({ error: "Tipo de rúbrica no soportado" }, { status: 400 });
    }

    const schema = buildRubricScoreSchemaFromConfig(rubric);

    const subdimensions = withResolvedDocs(
      schema.map((entry) => {
        const dim = rubric.dimensions.find((d) => d.name === entry.dimension);
        const sub = dim?.subdimensions.find((s) => s.name === entry.name);
        return {
          key: entry.key,
          dimension: entry.dimension,
          name: entry.name,
          rubricContent: dim && sub ? subdimensionEvalContent(dim, sub) : "",
        };
      }),
      evaluation.ragEvaluate
    );

    return NextResponse.json({
      rubricType: "ponderaciones",
      subdimensions,
      ragEvaluate,
      knowledgeReferenceLabel: evaluation.knowledgeReferenceLabel,
      projectElementsInRagQuery: evaluation.projectElementsInRagQuery,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
