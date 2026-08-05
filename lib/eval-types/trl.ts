import { defaultEvaluationConfigForType } from "@/lib/evaluation-config";
import {
  defaultExtractConfig,
  defaultEvaluationTypeSettings,
  type ExtractConfig,
  type EvaluationTypeSettings,
} from "@/lib/evaluation-type-settings";
import { defaultReportFormatTrl } from "@/lib/report-format-config";
import { defaultRubricConfigTrl } from "@/lib/rubric-config";
import { IGIP_ELEMENT_DEFS } from "@/lib/extract-fixtures/igip-elements";
import { buildExtractTypeSpecificDefaults } from "./extract-config-defaults";
import { DEFAULT_EXTRACT_SYSTEM_PROMPT } from "./prompt-defaults";

/** Elementos de extracción idénticos a IGIP (misma estructura de archivos). */
export function trlDefaultElements() {
  return IGIP_ELEMENT_DEFS.map((e) => ({ ...e }));
}

export function trlRubricDefault() {
  return defaultRubricConfigTrl();
}

export function trlExtractDefault(): ExtractConfig {
  const base = defaultExtractConfig();
  return {
    ...base,
    ...buildExtractTypeSpecificDefaults("TRL"),
    prompts: { system: DEFAULT_EXTRACT_SYSTEM_PROMPT },
  };
}

export function trlEvaluationDefaults() {
  return defaultEvaluationConfigForType("TRL");
}

export function trlReportFormatDefault() {
  return defaultReportFormatTrl();
}

export function trlTypeSettings(): EvaluationTypeSettings {
  const settings = defaultEvaluationTypeSettings("TRL");
  return {
    ...settings,
    extract: trlExtractDefault(),
    pipeline: {
      ...settings.pipeline,
      indicatorLabel: "TRL",
    },
  };
}
