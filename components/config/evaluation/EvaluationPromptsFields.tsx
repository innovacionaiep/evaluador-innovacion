"use client";

import type { EvaluationConfig } from "@/lib/evaluation-config";
import type { RubricConfig } from "@/lib/rubric-config";
import type { ReportFormatConfig } from "@/lib/report-format-config";
import {
  DEFAULT_ASSIGN_LEVEL_USER_PROMPT,
  DEFAULT_SUBDIMENSION_USER_PROMPT,
  DEFAULT_TRL_EVAL_USER_PROMPT,
  DEFAULT_VARIABLE_EVAL_USER_PROMPT,
} from "@/lib/eval-types/prompt-defaults";
import { PromptField, useEvaluationConfigHelpers } from "./evaluation-config-shared";

export function EvaluationPromptsFields({
  evaluation,
  rubric,
  reportFormat,
  onChange,
  includeFormatPrompts = false,
}: {
  evaluation: EvaluationConfig;
  rubric: RubricConfig;
  reportFormat: ReportFormatConfig;
  onChange: (e: EvaluationConfig) => void;
  includeFormatPrompts?: boolean;
}) {
  const { displayEvaluation, setPrompt } = useEvaluationConfigHelpers({
    evaluation,
    rubric,
    reportFormat,
    onChange,
  });

  return (
    <div className="space-y-2">
      {rubric.type === "ponderaciones" ? (
        <PromptField
          label="Plantilla user subdimensión"
          hint="Placeholders: {{dimension}}, {{subdimension}}, {{scoreExamples}}, {{knowledgeLabel}}, {{phaseInstructions}} (opcional, vacío por defecto)"
          value={displayEvaluation.prompts.subdimensionUser ?? ""}
          onChange={(v) => setPrompt("subdimensionUser", v)}
          onRestore={() => setPrompt("subdimensionUser", DEFAULT_SUBDIMENSION_USER_PROMPT)}
        />
      ) : rubric.type === "trl" ? (
        <PromptField
          label="Plantilla user evaluación TRL"
          hint="Placeholders: {{mainScale}}, {{levelNumbers}}, {{knowledgeLabel}}, {{phaseInstructions}}. Debe incluir la línea exacta Nivel: N."
          value={displayEvaluation.prompts.trlEval ?? ""}
          onChange={(v) => setPrompt("trlEval", v)}
          onRestore={() => setPrompt("trlEval", DEFAULT_TRL_EVAL_USER_PROMPT)}
        />
      ) : (
        <>
          <PromptField
            label="Plantilla user variable"
            hint="Placeholders: {{variable}}, {{levelNumbers}}, {{knowledgeLabel}}, {{phaseInstructions}} (opcional). Debe terminar con JSON {nivel: N}."
            value={displayEvaluation.prompts.variableEval ?? ""}
            onChange={(v) => setPrompt("variableEval", v)}
            onRestore={() => setPrompt("variableEval", DEFAULT_VARIABLE_EVAL_USER_PROMPT)}
          />
          {!(rubric.type === "niveles" && rubric.variables.length > 0) && (
            <PromptField
              label="Plantilla user nivel asignado"
              hint="Placeholders: {{mainScale}}, {{levelNumbers}}, {{knowledgeLabel}}, {{phaseInstructions}}"
              value={displayEvaluation.prompts.assignLevel ?? ""}
              onChange={(v) => setPrompt("assignLevel", v)}
              onRestore={() => setPrompt("assignLevel", DEFAULT_ASSIGN_LEVEL_USER_PROMPT)}
            />
          )}
        </>
      )}
      {includeFormatPrompts && (
        <>
          <PromptField
            label="Instrucciones extra formateo informe (opcional)"
            hint="Se añaden al system de cada sección. Vacío = sin instrucciones adicionales."
            value={evaluation.prompts.formatInstructions ?? ""}
            onChange={(v) => setPrompt("formatInstructions", v)}
            onRestore={() => setPrompt("formatInstructions", "")}
          />
          <PromptField
            label="Override system formateo (opcional)"
            hint="Texto extra concatenado al system de cada sección. Vacío = solo las plantillas de referencia."
            value={evaluation.prompts.formatSystem ?? ""}
            onChange={(v) => setPrompt("formatSystem", v)}
            onRestore={() => setPrompt("formatSystem", "")}
          />
        </>
      )}
    </div>
  );
}
