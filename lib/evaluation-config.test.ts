import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEvaluationConfigFromLegacy,
  defaultEvaluationConfig,
  defaultEvaluationConfigForType,
  isEvaluationConfigEmpty,
  mergeEvaluationConfig,
  resolveRagIncludeDocNames,
  normalizeRagIncludeDocNamesBySubdimension,
} from "@/lib/evaluation-config";
import {
  DEFAULT_EVAL_SYSTEM_FALLBACK,
  DEFAULT_SUBDIMENSION_USER_PROMPT,
  DEFAULT_VARIABLE_EVAL_USER_PROMPT,
} from "@/lib/eval-types/prompt-defaults";
import { defaultPipelineConfig } from "@/lib/evaluation-type-settings";
import { defaultReportFormatPonderaciones } from "@/lib/report-format-config";
import { defaultRubricConfigPonderaciones } from "@/lib/rubric-config";

describe("evaluation-config", () => {
  it("defaultEvaluationConfig has expected fields", () => {
    const cfg = defaultEvaluationConfig("TRL");
    assert.equal(cfg.indicatorLabel, "TRL");
    assert.equal(cfg.knowledgeReferenceLabel, "Manual de referencia");
    assert.equal(cfg.projectElementsInRagQuery, 8);
    assert.equal(cfg.parallelDimensions, true);
  });

  it("mergeEvaluationConfig prefers evaluation_config over legacy", () => {
    const rubric = defaultRubricConfigPonderaciones();
    const report = defaultReportFormatPonderaciones(rubric);
    const pipeline = defaultPipelineConfig("IGIP");
    const merged = mergeEvaluationConfig(
      {
        evaluation_config: { indicatorLabel: "Custom", knowledgeReferenceLabel: "Manual OSLO" },
        pipeline_config: pipeline,
        report_format_config: report,
      },
      "IGIP"
    );
    assert.equal(merged.indicatorLabel, "Custom");
    assert.equal(merged.knowledgeReferenceLabel, "Manual OSLO");
    assert.equal(merged.parallelSubdimensions, pipeline.parallelSubdimensions);
    assert.equal(merged.parallelDimensions, pipeline.parallelDimensions);
  });

  it("buildEvaluationConfigFromLegacy no sincroniza subdimensionEval desde report_format", () => {
    const rubric = defaultRubricConfigPonderaciones();
    const report = {
      ...defaultReportFormatPonderaciones(rubric),
      dimensionOverviewInstructions: "Instrucción legacy dim",
      subdimensionEvalInstructions: "Instrucción legacy sub",
      dimensionOverviewLimits: { minChars: 100, maxChars: 200 },
    };
    const built = buildEvaluationConfigFromLegacy(
      {
        pipeline_config: { indicatorLabel: "IGIP", parallelSubdimensions: false },
        report_format_config: report,
      },
      "IGIP"
    );
    assert.equal(built.indicatorLabel, "IGIP");
    assert.equal(built.parallelSubdimensions, false);
    assert.equal(built.phaseInstructions.subdimensionEval, "");
  });

  it("isEvaluationConfigEmpty", () => {
    assert.equal(isEvaluationConfigEmpty(null), true);
    assert.equal(isEvaluationConfigEmpty({}), true);
    assert.equal(isEvaluationConfigEmpty({ indicatorLabel: "X" }), false);
  });

  it("defaultEvaluationConfigForType incluye prompts IGIP", () => {
    const cfg = defaultEvaluationConfigForType("IGIP");
    assert.equal(cfg.prompts.subdimensionUser, DEFAULT_SUBDIMENSION_USER_PROMPT);
    assert.equal(cfg.prompts.subdimensionSystem, DEFAULT_EVAL_SYSTEM_FALLBACK);
  });

  it("defaultEvaluationConfigForType incluye prompts IMET", () => {
    const cfg = defaultEvaluationConfigForType("IMET");
    assert.match(cfg.prompts.variableEval ?? "", /variable/i);
    assert.equal(cfg.prompts.subdimensionSystem, DEFAULT_EVAL_SYSTEM_FALLBACK);
  });

  it("mergeEvaluationConfig rellena prompts vacíos desde defaults del tipo", () => {
    const merged = mergeEvaluationConfig({ evaluation_config: { prompts: {} } }, "IGIP");
    assert.equal(merged.prompts.subdimensionUser, DEFAULT_SUBDIMENSION_USER_PROMPT);
    assert.equal(merged.prompts.subdimensionSystem, DEFAULT_EVAL_SYSTEM_FALLBACK);

    const imet = mergeEvaluationConfig({ evaluation_config: { prompts: {} } }, "IMET");
    assert.equal(imet.prompts.variableEval, DEFAULT_VARIABLE_EVAL_USER_PROMPT);
  });

  it("resolveRagIncludeDocNames: override > global > todos", () => {
    const rag = {
      includeDocNames: ["Oslo.pdf", "TRL.pdf"],
      includeDocNamesBySubdimension: {
        "Novedad / Originalidad": ["Oslo.pdf"],
        "Impacto / Social": [],
      },
    };
    assert.deepEqual(resolveRagIncludeDocNames(rag, "Novedad / Originalidad"), ["Oslo.pdf"]);
    assert.equal(resolveRagIncludeDocNames(rag, "Impacto / Social"), undefined);
    assert.deepEqual(resolveRagIncludeDocNames(rag, "Otra / Sub"), ["Oslo.pdf", "TRL.pdf"]);
    assert.equal(resolveRagIncludeDocNames({}, "X"), undefined);
  });

  it("mergeEvaluationConfig persiste includeDocNamesBySubdimension", () => {
    const merged = mergeEvaluationConfig(
      {
        evaluation_config: {
          ragEvaluate: {
            includeDocNames: ["A.pdf"],
            includeDocNamesBySubdimension: {
              "Novedad / Originalidad": ["B.pdf"],
            },
          },
        },
      },
      "IGIP"
    );
    assert.deepEqual(merged.ragEvaluate.includeDocNames, ["A.pdf"]);
    assert.deepEqual(merged.ragEvaluate.includeDocNamesBySubdimension, {
      "Novedad / Originalidad": ["B.pdf"],
    });
    assert.deepEqual(
      normalizeRagIncludeDocNamesBySubdimension({
        "  X  ": ["  C.pdf  ", "C.pdf", ""],
        "": ["Z.pdf"],
      }),
      { X: ["C.pdf"] }
    );
  });
});
