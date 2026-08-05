import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FIXED_EVAL_TYPE_KEYS,
  fixedKeyFor,
  isTrl,
  rubricTypeFor,
} from "@/lib/eval-types/constants";
import { defaultsForType } from "@/lib/eval-types/defaults-for-type";
import { parseAssignedLevel } from "@/lib/rubric-niveles";
import { buildAuthoritativeTrlLevelSection } from "@/lib/evaluation-scores";

describe("TRL tipo fijo", () => {
  it("FIXED_EVAL_TYPE_KEYS incluye TRL", () => {
    assert.ok(FIXED_EVAL_TYPE_KEYS.includes("TRL"));
  });

  it("helpers discriminan TRL", () => {
    assert.equal(isTrl("TRL"), true);
    assert.equal(isTrl("IGIP"), false);
    assert.equal(rubricTypeFor("TRL"), "trl");
    assert.equal(fixedKeyFor("TRL"), "TRL");
  });

  it("defaults TRL: rúbrica vacía, extract IGIP-like, informe con resumen/síntesis", () => {
    const defs = defaultsForType("TRL");
    assert.equal(defs.rubric.type, "trl");
    assert.equal(defs.rubric.type === "trl" ? defs.rubric.levels.length : -1, 0);
    assert.equal(defs.evaluation.indicatorLabel, "TRL");
    assert.ok(defs.evaluation.prompts.trlEval);
    assert.ok(defs.reportFormat.preamble.some((s) => /Resumen/i.test(s.title)));
    assert.ok(defs.reportFormat.beforeScores.some((s) => /Síntesis/i.test(s.title)));
    assert.ok(defs.extract.prompts?.system);
  });

  it("parseAssignedLevel lee Nivel: N", () => {
    const text = "**Análisis**\nfoo\n\nNivel: 4\n\n**Justificación**\nbar";
    assert.equal(parseAssignedLevel(text, [1, 2, 3, 4, 5]), 4);
    assert.equal(parseAssignedLevel(text, [1, 2, 3]), null);
  });

  it("buildAuthoritativeTrlLevelSection es determinista", () => {
    assert.match(buildAuthoritativeTrlLevelSection(7), /Nivel TRL: 7/);
    assert.match(buildAuthoritativeTrlLevelSection(null), /Nivel TRL: —/);
  });
});
