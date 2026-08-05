import type { FlowConfigAction, FlowConfigActionId, IgipFlowStep } from "./igip-flow-definition";
import { FLOW_ACTION_LABELS } from "./igip-flow-definition";

export type TrlFlowStep = IgipFlowStep;

const TRL_ACTION_LABELS: Partial<Record<FlowConfigActionId, string>> = {
  rubric: "Rúbrica de niveles TRL",
};

export function getTrlFlowActionLabel(id: FlowConfigActionId): string {
  return TRL_ACTION_LABELS[id] ?? FLOW_ACTION_LABELS[id];
}

function trlAction(id: FlowConfigActionId): FlowConfigAction {
  return { id, label: getTrlFlowActionLabel(id) };
}

export const TRL_FLOW_STEPS: TrlFlowStep[] = [
  {
    id: "extract",
    order: 1,
    title: "Extracción del proyecto",
    description:
      "Indexa los documentos del proyecto y extrae cada elemento definido (Excel, PDF, etc.) mediante heurísticas y agente LLM. Misma estructura y métodos que IGIP.",
    actions: [
      trlAction("elements-list"),
      trlAction("extract-basic"),
      trlAction("extract-advanced"),
    ],
  },
  {
    id: "knowledge",
    order: 2,
    title: "Base de conocimiento",
    description:
      "Documentación de referencia indexada en RAG. Se consulta durante la evaluación TRL, no en la extracción.",
    branch: true,
    branchTarget: "evaluate",
    actions: [trlAction("knowledge-docs"), trlAction("rag-config")],
  },
  {
    id: "rubric",
    order: 3,
    title: "Rúbrica TRL",
    description:
      "Define únicamente los niveles TRL (sin variables ni subdimensiones). La evaluación clasifica el proyecto en uno de estos niveles.",
    actions: [trlAction("rubric")],
  },
  {
    id: "evaluate",
    order: 4,
    title: "Evaluación TRL",
    description:
      "Una sola evaluación principal: análisis, justificación, sugerencias y línea exacta «Nivel: N».",
    actions: [
      trlAction("eval-general"),
      trlAction("eval-orientation"),
      trlAction("eval-prompts"),
      trlAction("eval-rag"),
      trlAction("eval-limits"),
    ],
  },
  {
    id: "report",
    order: 5,
    title: "Ensamblado del informe",
    description:
      "Resumen del proyecto (LLM), evaluación TRL (verbatim), Nivel TRL: N (determinista) y síntesis final (LLM).",
    actions: [
      trlAction("report-structure"),
      trlAction("report-prompts"),
      trlAction("report-tokens"),
    ],
  },
  {
    id: "level",
    order: 6,
    title: "Nivel TRL",
    description:
      "Bloque autoritativo con el nivel asignado (Nivel TRL: N). No requiere configuración.",
    readOnly: true,
    actions: [],
  },
];
