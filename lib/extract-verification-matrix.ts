import type { ElementDef } from "@/lib/excel-heuristics";
import { IGIP_ELEMENT_DEFS } from "@/lib/extract-fixtures/igip-elements";

export type VerificationRow = {
  element: string;
  section: string;
  preferredMethods: string[];
  primarySource: "xlsx" | "pdf" | "docx" | "any";
  hasUnitTest: boolean;
  notes?: string;
};

/**
 * Matriz de verificación IGIP: método esperado por elemento y cobertura de tests.
 * Usar en QA manual tras subir fixtures xlsx/pdf/docx.
 */
export const IGIP_VERIFICATION_MATRIX: VerificationRow[] = [
  {
    element: "Nombre del proyecto",
    section: "Información General",
    preferredMethods: ["project_prominent", "heuristic:project_title_cell", "rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: false,
  },
  {
    element: "Continuidad de fases anteriores",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row"],
    primarySource: "xlsx",
    hasUnitTest: true,
  },
  {
    element: "Pertinencia local",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row"],
    primarySource: "xlsx",
    hasUnitTest: true,
  },
  {
    element: "Objetivo General",
    section: "Información General",
    preferredMethods: ["objectives_section", "heuristic:label_value_row", "rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: false,
  },
  {
    element: "Objetivos Específicos",
    section: "Información General",
    preferredMethods: ["objectives_section", "rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: false,
  },
  {
    element: "Sedes",
    section: "Información General",
    preferredMethods: ["heuristic:label_value_row", "keyword_scan", "rag_llm"],
    primarySource: "any",
    hasUnitTest: false,
    notes: "Metadata corta; válido con 2+ caracteres",
  },
  {
    element: "Escuelas",
    section: "Información General",
    preferredMethods: ["heuristic:label_value_row", "keyword_scan", "rag_llm"],
    primarySource: "any",
    hasUnitTest: false,
  },
  {
    element: "Pertinencia disciplinar",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "keyword_scan"],
    primarySource: "xlsx",
    hasUnitTest: false,
  },
  {
    element: "Necesidad, problema u oportunidad",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row"],
    primarySource: "xlsx",
    hasUnitTest: true,
  },
  {
    element: "Público objetivo",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "rag_llm"],
    primarySource: "any",
    hasUnitTest: false,
  },
  {
    element: "En qué consiste la solución y cuál es el nivel de avance actual",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: false,
  },
  {
    element: "Perspectiva de género",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "rag_llm"],
    primarySource: "any",
    hasUnitTest: false,
  },
  {
    element: "Ejes de impacto o focalizaciones",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "heuristic:label_value_row", "rag_llm"],
    primarySource: "any",
    hasUnitTest: true,
  },
  {
    element: "Sostenibilidad",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: true,
  },
  {
    element: "Objetivo de Desarrollo Sostenible",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: true,
  },
  {
    element: "Resultados y contribución esperada",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: true,
  },
  {
    element: "Metodología para medición de resultados",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: false,
  },
  {
    element: "Factor innovador del proyecto",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: true,
  },
  {
    element: "Escalabilidad",
    section: "Desarrollo Técnico",
    preferredMethods: ["form_row", "rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: true,
  },
  {
    element: "Actividades del proyecto",
    section: "Plan de Actividades (Gantt)",
    preferredMethods: ["rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: true,
    notes: "Extracción vía LLM Gantt; no determinista genérica",
  },
  {
    element: "Indicadores",
    section: "Indicadores",
    preferredMethods: ["rag_llm"],
    primarySource: "xlsx",
    hasUnitTest: true,
    notes: "Contexto de hoja para LLM; no tabla cruda determinista",
  },
];

export function matrixCoversAllConfigElements(elements: ElementDef[] = IGIP_ELEMENT_DEFS): boolean {
  const titles = new Set(elements.map((e) => e.title));
  return IGIP_VERIFICATION_MATRIX.every((row) => titles.has(row.element));
}

export function untestedMatrixRows(): VerificationRow[] {
  return IGIP_VERIFICATION_MATRIX.filter((r) => !r.hasUnitTest);
}
