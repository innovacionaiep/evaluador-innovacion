import type { FlowConfigAction, FlowConfigActionId, IgipFlowStep } from "./igip-flow-definition";
import { FLOW_ACTION_LABELS } from "./igip-flow-definition";

export type ImetFlowStep = IgipFlowStep;

const IMET_ACTION_LABELS: Partial<Record<FlowConfigActionId, string>> = {
  rubric: "Rúbrica de variables y niveles",
};

export function getImetFlowActionLabel(id: FlowConfigActionId): string {
  return IMET_ACTION_LABELS[id] ?? FLOW_ACTION_LABELS[id];
}

function imetAction(id: FlowConfigActionId): FlowConfigAction {
  return { id, label: getImetFlowActionLabel(id) };
}

export const IMET_FLOW_STEPS: ImetFlowStep[] = [
  {
    id: "extract",
    order: 1,
    title: "Extracción del proyecto",
    description:
      "Indexa los documentos del proyecto y extrae cada elemento definido (Excel, PDF, etc.) mediante heurísticas y agente LLM.",
    actions: [
      imetAction("elements-list"),
      imetAction("extract-basic"),
      imetAction("extract-advanced"),
    ],
  },
  {
    id: "knowledge",
    order: 2,
    title: "Base de conocimiento",
    description:
      "Documentación de referencia indexada en RAG. Se consulta durante la evaluación por variable, no en la extracción.",
    branch: true,
    branchTarget: "evaluate",
    actions: [imetAction("knowledge-docs"), imetAction("rag-config")],
  },
  {
    id: "rubric",
    order: 3,
    title: "Rúbrica IMET",
    description:
      "Define las variables de evaluación y sus subniveles. Los niveles principales quedan solo como referencia visual.",
    actions: [imetAction("rubric")],
  },
  {
    id: "evaluate",
    order: 4,
    title: "Evaluación por variables",
    description:
      "Por cada variable: consulta RAG y genera análisis con subnivel en JSON. El índice IMET es el promedio simple de las notas (2 decimales).",
    actions: [
      imetAction("eval-general"),
      imetAction("eval-orientation"),
      imetAction("eval-prompts"),
      imetAction("eval-rag"),
      imetAction("eval-limits"),
    ],
  },
  {
    id: "report",
    order: 5,
    title: "Ensamblado del informe",
    description:
      "Incluye resumen del proyecto, análisis por variable, notas/índice y síntesis evaluativa final.",
    actions: [
      imetAction("report-structure"),
      imetAction("report-prompts"),
      imetAction("report-tokens"),
    ],
  },
  {
    id: "level",
    order: 6,
    title: "Índice IMET",
    description:
      "Promedio simple de los subniveles asignados a cada variable. No requiere configuración.",
    readOnly: true,
    actions: [],
  },
];
