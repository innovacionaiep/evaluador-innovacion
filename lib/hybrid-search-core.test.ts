import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cosineSimilarity,
  keywordScore,
  scoreChunks,
  selectChunksWithLimits,
  filterChunksByIncludeDocNames,
  computeEvaluateMaxPerDoc,
  knowledgeChunkQualityAdjustments,
  knowledgeChunkTocAdjustments,
  formatDocMixSummary,
} from "@/lib/hybrid-search-core";
import type { RetrievedChunk } from "@/lib/chunk-types";

describe("hybrid-search-core", () => {
  it("cosineSimilarity de vectores idénticos es 1", () => {
    const v = [1, 0, 0];
    assert.equal(cosineSimilarity(v, v), 1);
  });

  it("keywordScore aumenta con términos compartidos", () => {
    const low = keywordScore("innovación producto", "texto sobre economía");
    const high = keywordScore("innovación producto", "la innovación del producto");
    assert.ok(high > low);
  });

  it("scoreChunks devuelve chunks ordenados por score", () => {
    const chunks = [
      {
        id: "a",
        docName: "d",
        text: "innovación novedad originalidad",
        embedding: [1, 0],
      },
      {
        id: "b",
        docName: "d",
        text: "otro tema",
        embedding: [0, 1],
      },
    ];
    const ranked = scoreChunks(chunks, "innovación novedad", [1, 0], { topK: 2 });
    assert.equal(ranked[0]?.id, "a");
    assert.ok(ranked[0]!.score >= (ranked[1]?.score ?? 0));
  });

  it("filterChunksByIncludeDocNames excluye docs no listados", () => {
    const chunks = [
      { id: "1", docName: "Oslo.pdf", text: "a", embedding: [1] },
      { id: "2", docName: "Guia.pdf", text: "b", embedding: [1] },
    ];
    const filtered = filterChunksByIncludeDocNames(chunks, ["Guia.pdf"]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.docName, "Guia.pdf");
    assert.equal(filterChunksByIncludeDocNames(chunks, []).length, 2);
    assert.equal(filterChunksByIncludeDocNames(chunks, undefined).length, 2);
  });

  it("selectChunksWithLimits aplica cupo por documento", () => {
    const ranked: RetrievedChunk[] = [
      { id: "a1", docName: "A", text: "uno", embedding: [], score: 1 },
      { id: "a2", docName: "A", text: "dos", embedding: [], score: 0.9 },
      { id: "a3", docName: "A", text: "tres", embedding: [], score: 0.8 },
      { id: "b1", docName: "B", text: "uno", embedding: [], score: 0.7 },
      { id: "b2", docName: "B", text: "dos", embedding: [], score: 0.6 },
    ];
    const without = selectChunksWithLimits(ranked, 4, 10_000);
    assert.deepEqual(
      without.map((c) => c.id),
      ["a1", "a2", "a3", "b1"]
    );
    const withCap = selectChunksWithLimits(ranked, 4, 10_000, 2);
    assert.deepEqual(
      withCap.map((c) => c.id),
      ["a1", "a2", "b1", "b2"]
    );
  });

  it("scoreChunks con maxPerDoc mezcla documentos", () => {
    const chunks = [
      { id: "a1", docName: "Oslo.pdf", text: "innovación survey questionnaire CIS", embedding: [1, 0] },
      { id: "a2", docName: "Oslo.pdf", text: "innovación measuring business innovation", embedding: [0.99, 0.01] },
      { id: "a3", docName: "Oslo.pdf", text: "innovación data collection respondents", embedding: [0.98, 0.02] },
      { id: "b1", docName: "Otro.pdf", text: "innovación producto proceso", embedding: [0.5, 0.5] },
      { id: "b2", docName: "Otro.pdf", text: "innovación impacto social", embedding: [0.4, 0.6] },
    ];
    const pure = scoreChunks(chunks, "innovación", [1, 0], {
      topK: 4,
      scoreAdjust: () => 0,
    });
    assert.ok(pure.every((c) => c.docName === "Oslo.pdf") || pure.filter((c) => c.docName === "Oslo.pdf").length >= 3);

    const diverse = scoreChunks(chunks, "innovación", [1, 0], {
      topK: 4,
      maxPerDoc: 2,
      scoreAdjust: () => 0,
    });
    const docs = new Set(diverse.map((c) => c.docName));
    assert.ok(docs.has("Oslo.pdf"));
    assert.ok(docs.has("Otro.pdf"));
    assert.ok(diverse.filter((c) => c.docName === "Oslo.pdf").length <= 2);
  });

  it("computeEvaluateMaxPerDoc y formatDocMixSummary", () => {
    assert.equal(computeEvaluateMaxPerDoc(10, 1), undefined);
    assert.equal(computeEvaluateMaxPerDoc(10, 2), 5);
    assert.equal(computeEvaluateMaxPerDoc(55, 4), 14);
    assert.equal(
      formatDocMixSummary([
        { docName: "A" },
        { docName: "B" },
        { docName: "A" },
      ]),
      "2 doc(s): A×2, B×1"
    );
  });

  it("evaluate adjustments omiten boosts Oslo", () => {
    const osloText =
      "1.2. Measuring\ninnovation survey questionnaire CIS data collection measuring business innovation";
    const full = knowledgeChunkQualityAdjustments(osloText);
    const tocOnly = knowledgeChunkQualityAdjustments(osloText, { includeOsloBoosts: false });
    assert.ok(full > tocOnly);
    assert.equal(tocOnly, knowledgeChunkTocAdjustments(osloText));
  });
});
