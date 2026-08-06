import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAssignedLevel } from "@/lib/rubric-niveles";
import {
  TRL_LEVEL_SCORE_KEY,
  buildRubricScoreSchemaFromConfig,
  defaultRubricConfigTrl,
} from "@/lib/rubric-config";
import { buildEvaluationScoresPayload } from "@/lib/evaluation-scores";
import { validateProjectElementsForEvaluation } from "@/lib/evaluate-system-context-strict";

describe("evaluate pipeline guards (TRL / niveles / IGIP shared)", () => {
  it("validateProjectElementsForEvaluation rejects empty table", () => {
    assert.throws(
      () => validateProjectElementsForEvaluation([]),
      /No hay elementos extraídos/
    );
  });

  it("validateProjectElementsForEvaluation accepts non-empty content", () => {
    assert.doesNotThrow(() =>
      validateProjectElementsForEvaluation([
        { element: "Objetivo", content: "Mejorar el proceso de innovación en la sede." },
      ])
    );
  });

  it("parseAssignedLevel reads Nivel: N from TRL-style output", () => {
    const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    assert.equal(parseAssignedLevel("Análisis...\n\nNivel: 4\nJustificación", levels), 4);
    assert.equal(parseAssignedLevel("**Nivel:** 7", levels), 7);
    assert.equal(parseAssignedLevel("sin nivel claro", levels), null);
  });

  it("TRL score payload uses canonical trl:nivel key", () => {
    const rubric = defaultRubricConfigTrl();
    const schema = buildRubricScoreSchemaFromConfig(rubric);
    const payload = buildEvaluationScoresPayload(
      schema,
      { [TRL_LEVEL_SCORE_KEY]: 5 },
      "TRL"
    );
    assert.ok(schema.some((e) => e.key === TRL_LEVEL_SCORE_KEY));
    assert.equal(payload.subdimensionScores[TRL_LEVEL_SCORE_KEY], 5);
  });
});
