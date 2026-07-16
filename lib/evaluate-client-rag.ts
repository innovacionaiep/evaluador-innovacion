import type { RetrievedChunk, StoredChunk } from "@/lib/chunk-types";
import { clientHybridRetrieve } from "@/lib/client-rag";
import { buildSubdimensionKnowledgeQuery } from "@/lib/evaluate-rag-query";
import { subdimensionScoreKey } from "@/lib/evaluation-scores";
import {
  computeEvaluateMaxPerDoc,
  filterChunksByIncludeDocNames,
  knowledgeChunkEvaluateScoreAdjust,
  normalizeIncludeDocNames,
} from "@/lib/hybrid-search-core";

export type EvaluatePlanSubdimension = {
  key: string;
  dimension: string;
  name: string;
  rubricContent: string;
  /** Allowlist ya resuelta para esta subdimensión (omitido = todos). */
  includeDocNames?: string[];
};

export type EvaluatePlanResponse = {
  rubricType?: "ponderaciones" | "niveles";
  subdimensions: EvaluatePlanSubdimension[];
  ragEvaluate: {
    topK: number;
    maxRetrievedChars: number;
    includeDocNames?: string[];
  };
  knowledgeReferenceLabel: string;
  projectElementsInRagQuery: number;
};

export async function fetchEvaluatePlan(evaluationTypeId: number): Promise<EvaluatePlanResponse> {
  const res = await fetch(`/api/config/${evaluationTypeId}/evaluate-plan`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "No se pudo cargar el plan de evaluación");
  }
  return res.json() as Promise<EvaluatePlanResponse>;
}

export async function buildPrecomputedChunksForEvaluation(params: {
  evaluationTypeId: number;
  projectElementsTable: { element: string; content: string }[];
  chunks: StoredChunk[];
  plan?: EvaluatePlanResponse;
}): Promise<Record<string, RetrievedChunk[]>> {
  const plan = params.plan ?? (await fetchEvaluatePlan(params.evaluationTypeId));
  if (plan.rubricType === "niveles" && plan.subdimensions.length === 1 && plan.subdimensions[0].key === "nivel-global") {
    return {};
  }

  if (params.chunks.length === 0) {
    throw new Error("No hay fragmentos Knowledge indexados para precomputar la evaluación.");
  }

  const topK = plan.ragEvaluate.topK;
  const out: Record<string, RetrievedChunk[]> = {};

  for (const sub of plan.subdimensions) {
    const includeDocNames = normalizeIncludeDocNames(sub.includeDocNames);
    const pool = filterChunksByIncludeDocNames(params.chunks, includeDocNames);
    if (pool.length === 0) {
      throw new Error(
        includeDocNames?.length
          ? `No hay fragmentos Knowledge de los documentos seleccionados para «${sub.name}» (${includeDocNames.join(", ")}). Revise «RAG en evaluación» o reindexe Knowledge.`
          : `No hay fragmentos Knowledge para precomputar «${sub.name}».`
      );
    }

    const docCount = new Set(pool.map((c) => c.docName)).size;
    const maxPerDoc = computeEvaluateMaxPerDoc(topK, docCount);
    const dim: { name: string; content: string } = {
      name: sub.dimension,
      content: sub.rubricContent,
    };
    const subdim = { name: sub.name, content: sub.rubricContent };
    const query = buildSubdimensionKnowledgeQuery(
      dim,
      subdim,
      params.projectElementsTable,
      plan.projectElementsInRagQuery
    );
    const key = sub.key || subdimensionScoreKey(sub.dimension, sub.name);
    out[key] = await clientHybridRetrieve(pool, query, {
      topK,
      maxRetrievedChars: plan.ragEvaluate.maxRetrievedChars,
      maxPerDoc,
      scoreAdjust: knowledgeChunkEvaluateScoreAdjust,
    });
  }

  return out;
}
