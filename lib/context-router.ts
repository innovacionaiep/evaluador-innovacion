import { chatCompletion } from "@/lib/openrouter";
import {
  classifyChatIntent,
  chatIntentToContextMode,
  parsePageFromQuery,
  parseChapterFromQuery,
  parseChaptersFromQuery,
  isChapterComparisonQuery,
} from "@/lib/chat-intent";
import {
  type ContextPlan,
  type AgentLevel,
  type ContextComplexity,
  validateAndNormalizePlan,
  knowledgeOnlyPlan,
  multiChapterComparisonPlan,
  projectOnlyPlan,
  configOnlyPlan,
} from "@/lib/context-plan";
import type { ContextMode } from "@/lib/rag-limits";

export type RouterInput = {
  message: string;
  hasProjectData: boolean;
  hasRubric: boolean;
  hasInstructions: boolean;
  hasKnowledge: boolean;
};

const ROUTER_SYSTEM = `Eres un agente planificador de contexto para un evaluador de proyectos de innovación.
Tu única tarea es analizar la pregunta del usuario y devolver un JSON con el plan de qué fuentes incluir en el system prompt.

Fuentes disponibles (sources):
- config_summary: resumen de configuración (instrucciones, formato, elementos, estado rúbrica)
- instructions: instrucciones de evaluación completas
- report_format: formato del informe
- rubric: rúbrica y criterios de evaluación
- project: elementos extraídos del proyecto
- project_structured: datos Excel estructurados
- knowledge_rag: fragmentos del manual de referencia (Knowledge / Manual Oslo)

Reglas:
- Si preguntan por el manual, knowledge, Oslo, innovación teórica, definiciones → sources SOLO knowledge_rag (o knowledge_rag + project si comparan). excludeSources debe incluir rubric, instructions, report_format, config_summary salvo que también pregunten por ellos.
- Si preguntan por el proyecto (objetivos, presupuesto, sedes…) → project (+ project_structured si hay Excel). excludeSources: rubric, knowledge_rag salvo que también lo pidan.
- Si preguntan por instrucciones, formato, elementos, rúbrica configurada → config sources. excludeSources: knowledge_rag, project.
- Si preguntan por la rúbrica Y el manual/Oslo (evaluar la rúbrica según el manual) → sources knowledge_rag + rubric; NO excluir rubric; agentLevel C, useToolLoop true.
- Si comparan manual Y proyecto O necesitan varias fuentes → complexity "moderate" o "complex", agentLevel "B" o "C", useToolLoop true.
- Pregunta simple de una sola fuente → agentLevel "A", complexity "simple", useToolLoop false.
- Comparación, varios pasos, "según el manual y el proyecto" → agentLevel "C", complexity "complex", useToolLoop true.
- Pregunta que requiere buscar en manual Y leer proyecto pero en un paso → agentLevel "B", complexity "moderate", useToolLoop true.

Responde ÚNICAMENTE con JSON válido (sin markdown):
{
  "agentLevel": "A" | "B" | "C",
  "complexity": "simple" | "moderate" | "complex",
  "intent": "knowledge" | "project" | "config" | "mixed",
  "intentLabel": "texto corto en español",
  "sources": ["..."],
  "excludeSources": ["..."],
  "ragMode": "chat-knowledge" | "chat-project" | "chat-config" | "chat-chapter",
  "ragQuery": "consulta para búsqueda RAG si aplica",
  "reasoning": "1-2 frases en español",
  "responseRules": ["regla 1", "regla 2"],
  "useToolLoop": false,
  "toolsHint": ["search_knowledge", "get_project_elements"]
}`;

function intentToDefaultPlan(
  intent: string,
  message: string,
  input: RouterInput,
  contextMode: ContextMode,
  page?: number,
  chapter?: number
): ContextPlan {
  if (page != null || chapter != null) {
    return knowledgeOnlyPlan(
      page != null
        ? `Manual Oslo página ${page} chapter section content`
        : `Manual Oslo Chapter ${chapter} capítulo ${chapter} resumen`,
      page,
      chapter
    );
  }
  if (intent === "knowledge") {
    return knowledgeOnlyPlan(message);
  }
  if (intent === "project") {
    return projectOnlyPlan(message);
  }
  return configOnlyPlan();
}

function applyHardRules(plan: ContextPlan, message: string, input: RouterInput): ContextPlan {
  const m = message.toLowerCase();
  let p = { ...plan };

  const asksRubric =
    /\br[uú]brica\b/i.test(message) ||
    /\bcriterios?\s+de\s+evaluaci[oó]n\b/i.test(message) ||
    /\bigip\b/i.test(message);
  const asksKnowledge =
    /\b(manual|knowledge|oslo|marco\s+te[oó]rico)\b/i.test(message) ||
    /\bqu[eé]\s+es\s+la\s+innovaci[oó]n\b/i.test(message);
  const asksProject = /\bproyecto\b/i.test(message) || input.hasProjectData;
  const asksConfig =
    /\b(instrucciones?|formato\s+del\s+informe|elementos?\s+a\s+identificar|configuraci[oó]n)\b/i.test(
      message
    );

  const chapterNumbers = parseChaptersFromQuery(message);
  const multiChapter = chapterNumbers.length >= 2 || isChapterComparisonQuery(message);

  if (multiChapter && asksKnowledge && !asksRubric && !asksConfig) {
    const nums =
      chapterNumbers.length >= 2 ? chapterNumbers : chapterNumbers.length === 1 ? chapterNumbers : [];
    if (nums.length >= 2) {
      p = multiChapterComparisonPlan(p.ragQuery || message, nums);
    }
  } else if (asksKnowledge && !asksRubric && !asksConfig) {
    p = knowledgeOnlyPlan(p.ragQuery || message, p.pageNumber, p.chapterNumber);
    if (asksProject && input.hasProjectData) {
      p.sources = ["knowledge_rag", "project", "project_structured"];
      p.excludeSources = ["rubric", "instructions", "report_format", "config_summary"];
      p.agentLevel = "B";
      p.complexity = "moderate";
      p.useToolLoop = true;
      p.intent = "mixed";
      p.intentLabel = "Manual y proyecto";
      p.toolsHint = ["search_knowledge", "get_project_elements"];
    }
  }

  if (asksRubric) {
    p.sources = [...new Set([...p.sources, "rubric"])] as ContextPlan["sources"];
    p.excludeSources = p.excludeSources.filter((s) => s !== "rubric");
  }

  if (asksRubric && asksKnowledge) {
    p.sources = [...new Set([...p.sources, "knowledge_rag", "rubric"])] as ContextPlan["sources"];
    p.excludeSources = p.excludeSources.filter(
      (s) => s !== "rubric" && s !== "knowledge_rag"
    );
    p.agentLevel = "C";
    p.complexity = "complex";
    p.useToolLoop = true;
    p.intent = "mixed";
    p.intentLabel = "Evaluación de rúbrica según manual";
    p.toolsHint = [...new Set([...p.toolsHint, "search_knowledge", "get_rubric"])];
    p.responseRules = [
      "Responde en español evaluando si la rúbrica está bien formulada según el manual de referencia.",
      "DEBES usar el texto de la rúbrica configurada y los fragmentos del Knowledge en tu respuesta.",
      "Indica fortalezas, debilidades y recomendaciones concretas de mejora.",
    ];
  } else if (asksRubric && !asksKnowledge) {
    p.sources = [...new Set([...p.sources, "config_summary"])] as ContextPlan["sources"];
  }

  if (asksConfig && !asksKnowledge && !asksProject) {
    p = { ...configOnlyPlan(), ...p, sources: configOnlyPlan().sources };
  }

  const comparesMultiple =
    (asksKnowledge && asksProject) ||
    (asksKnowledge && asksRubric) ||
    /\bcompar(a|ar|ación)\b/i.test(m) ||
    /\bseg[uú]n\s+el\s+manual\b.*\bproyecto\b/i.test(m) ||
    /\bmanual\b.*\by\b.*\bproyecto\b/i.test(m);

  if (comparesMultiple) {
    if (multiChapter && asksKnowledge && chapterNumbers.length >= 2) {
      p = multiChapterComparisonPlan(p.ragQuery || message, chapterNumbers);
    } else {
      p.agentLevel = "C";
      p.complexity = "complex";
      p.useToolLoop = true;
      p.toolsHint = ["search_knowledge", "get_project_elements", "get_rubric", "get_config"];
    }
  } else if (p.useToolLoop && p.agentLevel === "A") {
    p.agentLevel = "B";
    p.complexity = "moderate";
  }

  if (!input.hasProjectData) {
    p.sources = p.sources.filter((s) => s !== "project" && s !== "project_structured");
  }
  if (!input.hasRubric) {
    p.sources = p.sources.filter((s) => s !== "rubric");
  }
  if (!input.hasKnowledge) {
    p.sources = p.sources.filter((s) => s !== "knowledge_rag");
  }

  return validateAndNormalizePlan(p, configOnlyPlan());
}

function parseRouterJson(raw: string): Partial<ContextPlan> | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as Partial<ContextPlan>;
  } catch {
    return null;
  }
}

function mapComplexityToLevel(complexity: ContextComplexity, useToolLoop: boolean): AgentLevel {
  if (!useToolLoop) return "A";
  if (complexity === "complex") return "C";
  if (complexity === "moderate") return "B";
  return "A";
}

/**
 * Nivel A: router LLM + reglas duras + fallback regex.
 */
export async function routeContextPlan(input: RouterInput): Promise<ContextPlan> {
  const pageNumber = parsePageFromQuery(input.message);
  const chapterNumbers = parseChaptersFromQuery(input.message);
  const chapterNumber =
    pageNumber == null && chapterNumbers.length === 1 ? chapterNumbers[0] : undefined;
  const multiChapterCompare =
    chapterNumbers.length >= 2 || isChapterComparisonQuery(input.message);

  const regexIntent =
    pageNumber != null || chapterNumber != null || multiChapterCompare
      ? "knowledge"
      : classifyChatIntent(input.message, input.hasProjectData);
  const contextMode: ContextMode =
    chapterNumber != null && !multiChapterCompare
      ? "chat-chapter"
      : chatIntentToContextMode(regexIntent);

  if (multiChapterCompare && chapterNumbers.length >= 2) {
    const plan = applyHardRules(
      multiChapterComparisonPlan(input.message, chapterNumbers),
      input.message,
      input
    );
    return plan;
  }

  const fallback = intentToDefaultPlan(
    regexIntent,
    input.message,
    input,
    contextMode,
    pageNumber,
    chapterNumber
  );

  if (pageNumber != null || chapterNumber != null) {
    return applyHardRules(fallback, input.message, input);
  }

  try {
    const raw = await chatCompletion(
      [
        { role: "system", content: ROUTER_SYSTEM },
        {
          role: "user",
          content: `Pregunta del usuario: ${input.message}

Disponibilidad:
- Proyecto subido: ${input.hasProjectData ? "sí" : "no"}
- Rúbrica configurada: ${input.hasRubric ? "sí" : "no"}
- Instrucciones configuradas: ${input.hasInstructions ? "sí" : "no"}
- Knowledge indexado: ${input.hasKnowledge ? "sí" : "no"}`,
        },
      ],
      { max_tokens: 900, temperature: 0.1, useCase: "router" }
    );

    const parsed = parseRouterJson(raw);
    if (parsed) {
      const useToolLoop = parsed.useToolLoop === true;
      const complexity = parsed.complexity ?? fallback.complexity;
      const agentLevel =
        parsed.agentLevel ?? mapComplexityToLevel(complexity, useToolLoop);
      const plan = validateAndNormalizePlan(
        {
          ...parsed,
          agentLevel,
          complexity,
          useToolLoop,
          pageNumber,
          chapterNumber,
          ragMode: parsed.ragMode ?? contextMode,
          ragQuery: parsed.ragQuery ?? input.message,
        },
        fallback
      );
      return applyHardRules(plan, input.message, input);
    }
  } catch {
    /* fallback regex */
  }

  return applyHardRules(fallback, input.message, input);
}

export function planToIntentLabel(plan: ContextPlan): string {
  return plan.intentLabel;
}

export function planSourcesSummary(plan: ContextPlan): string {
  const inc = plan.sources.join(", ") || "ninguna";
  const exc = plan.excludeSources.length ? plan.excludeSources.join(", ") : "ninguna";
  return `Incluir: ${inc}. Excluir: ${exc}. Nivel agente: ${plan.agentLevel}.`;
}
