import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPrecomputedChunksForEvaluation } from "@/lib/evaluate-client-rag";
import type { StoredChunk } from "@/lib/chunk-types";

describe("evaluate-client-rag", () => {
  it("no precomputa subdimensiones para rúbrica por niveles", async () => {
    const chunks: StoredChunk[] = [
      {
        id: "c1",
        docName: "Manual.pdf",
        text: "Criterios de madurez tecnológica",
        embedding: [],
      },
    ];

    const out = await buildPrecomputedChunksForEvaluation({
      evaluationTypeId: 99,
      projectElementsTable: [{ element: "Nombre del proyecto", content: "DocuCore" }],
      chunks,
      plan: {
        rubricType: "niveles",
        subdimensions: [
          {
            key: "nivel-global",
            dimension: "Nivel global",
            name: "Asignación de nivel",
            rubricContent: "Nivel 1 — Idea",
          },
        ],
        ragEvaluate: { topK: 8, maxRetrievedChars: 12_000 },
        knowledgeReferenceLabel: "Knowledge",
        projectElementsInRagQuery: 6,
      },
    });

    assert.deepEqual(out, {});
  });

  it("falla si includeDocNames de la sub no deja chunks", async () => {
    const chunks: StoredChunk[] = [
      {
        id: "c1",
        docName: "Manual.pdf",
        text: "Criterios",
        embedding: [0.1],
      },
    ];

    await assert.rejects(
      () =>
        buildPrecomputedChunksForEvaluation({
          evaluationTypeId: 99,
          projectElementsTable: [{ element: "X", content: "Y" }],
          chunks,
          plan: {
            rubricType: "ponderaciones",
            subdimensions: [
              {
                key: "novedad::orig",
                dimension: "Novedad",
                name: "Originalidad",
                rubricContent: "Criterio",
                includeDocNames: ["OtroDoc.pdf"],
              },
            ],
            ragEvaluate: {
              topK: 8,
              maxRetrievedChars: 12_000,
            },
            knowledgeReferenceLabel: "Knowledge",
            projectElementsInRagQuery: 6,
          },
        }),
      /documentos seleccionados/
    );
  });

  it("filtra pools distintos por subdimensión según includeDocNames", async () => {
    const { filterChunksByIncludeDocNames } = await import("@/lib/hybrid-search-core");
    const chunks: StoredChunk[] = [
      { id: "1", docName: "Oslo.pdf", text: "a", embedding: [1] },
      { id: "2", docName: "TRL.pdf", text: "b", embedding: [1] },
    ];
    const osloOnly = filterChunksByIncludeDocNames(chunks, ["Oslo.pdf"]);
    const trlOnly = filterChunksByIncludeDocNames(chunks, ["TRL.pdf"]);
    assert.deepEqual(
      osloOnly.map((c) => c.docName),
      ["Oslo.pdf"]
    );
    assert.deepEqual(
      trlOnly.map((c) => c.docName),
      ["TRL.pdf"]
    );
  });
});
