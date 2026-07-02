import {
  chatCompletion,
  chatCompletionWithTools,
  type OpenAIToolDef,
} from "@/lib/openrouter";
import type { ElementDef } from "@/lib/excel-heuristics";
import { executeProjectExtractTool } from "@/lib/project-extract-tools";
import { finalizeContentForElement } from "@/lib/extract-content-clean";

const EXTRACT_SYSTEM_PROMPT = `Eres un extractor de información de proyectos de innovación.

Tu tarea es identificar y redactar el contenido de UN elemento concreto del proyecto, usando las herramientas para buscar en todo el documento.

Reglas:
- Usa el título y la descripción del elemento como guía semántica (no busques solo coincidencia literal del título).
- Busca en todo el proyecto: tablas, párrafos, secciones y hojas Excel.
- En bitácoras Excel, revisa get_structured_excel en la hoja "Resumen Proyecto": metadata (Sede, Escuelas) en filas superiores; preguntas largas en filas inferiores.
- Puedes sintetizar información dispersa en varias partes del documento.
- Prioriza fidelidad al documento; no inventes datos que no aparezcan en las fuentes.
- Para nivel de avance: no confundas fases planificadas con ejecución real; respeta expresiones como "nace desde cero" o "sin financiamiento previo".
- Si no hay evidencia suficiente, devuelve content vacío.
- Cuando termines de buscar, responde ÚNICAMENTE JSON: {"content":"...","confidence":"high|medium|low"}`;

export const PROJECT_EXTRACT_TOOL_DEFINITIONS: OpenAIToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_project",
      description:
        "Búsqueda semántica híbrida (RAG) en todo el proyecto. Usa consultas descriptivas en español, no solo el título del elemento.",
      parameters: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: { type: "string" },
            description: "1-4 consultas de búsqueda en español",
          },
        },
        required: ["queries"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_overview",
      description: "Vista general del proyecto indexado: archivos, fragmentos iniciales y metadata.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_structured_excel",
      description: "Lee celdas estructuradas de hojas Excel del proyecto. Opcionalmente filtra por nombre de hoja.",
      parameters: {
        type: "object",
        properties: {
          fileName: { type: "string", description: "Nombre del archivo Excel (opcional)" },
          sheetName: { type: "string", description: "Nombre de la hoja (opcional)" },
          maxCells: { type: "number", description: "Máximo de celdas a devolver (default 400)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_document_pages",
      description: "Lee páginas PDF o secciones de Word/texto/imagen del proyecto.",
      parameters: {
        type: "object",
        properties: {
          fileName: { type: "string", description: "Nombre del archivo (opcional)" },
          pageFrom: { type: "number", description: "Página inicial (PDF, 1-based)" },
          pageTo: { type: "number", description: "Página final (PDF, inclusive)" },
          maxChars: { type: "number", description: "Máximo de caracteres (default 12000)" },
        },
      },
    },
  },
];

const MAX_TOOL_ITERATIONS = 5;
const DEFAULT_ELEMENT_TIMEOUT_MS = 45_000;

function parseExtractJson(raw: string): { content: string; confidence: string } {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { content: trimmed, confidence: "low" };
  try {
    const obj = JSON.parse(jsonMatch[0]) as { content?: string; confidence?: string };
    return {
      content: typeof obj.content === "string" ? obj.content : "",
      confidence: typeof obj.confidence === "string" ? obj.confidence : "medium",
    };
  } catch {
    return { content: trimmed, confidence: "low" };
  }
}

export type ExtractElementLlmResult = {
  content: string;
  method: string;
  confidence: string;
};

async function runExtractAgentLoop(
  sessionId: string,
  element: ElementDef,
  extraHints?: string
): Promise<ExtractElementLlmResult> {
  const userPrompt = `Elemento a extraer: "${element.title}"
Sección: ${element.section ?? "General"}
Descripción de qué buscar: ${element.description}
${extraHints ?? ""}

Usa las herramientas para buscar en todo el proyecto. Cuando tengas suficiente información, responde con JSON {"content":"...","confidence":"high|medium|low"}.`;

  type ToolMessage = Parameters<typeof chatCompletionWithTools>[0][number];
  const messages: ToolMessage[] = [
    { role: "system", content: EXTRACT_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const { content, toolCalls } = await chatCompletionWithTools(
      messages,
      PROJECT_EXTRACT_TOOL_DEFINITIONS,
      { max_tokens: 4096, temperature: 0.15, useCase: "extract" }
    );

    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: content ?? null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      for (const tc of toolCalls) {
        const result = await executeProjectExtractTool(sessionId, tc.name, tc.arguments);
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      continue;
    }

    if (content?.trim()) {
      const parsed = parseExtractJson(content);
      return {
        content: parsed.content,
        method: `llm_first:${parsed.confidence}`,
        confidence: parsed.confidence,
      };
    }
    break;
  }

  return { content: "", method: "llm_first:empty", confidence: "low" };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout (${label}) tras ${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

/**
 * Extrae un elemento usando LLM + herramientas de búsqueda en el índice del proyecto.
 */
export async function extractElementLlmFirst(
  sessionId: string,
  element: ElementDef,
  options?: { timeoutMs?: number; extraHints?: string }
): Promise<ExtractElementLlmResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_ELEMENT_TIMEOUT_MS;
  const extraHints = options?.extraHints ?? "";

  try {
    const result = await withTimeout(
      runExtractAgentLoop(sessionId, element, extraHints),
      timeoutMs,
      element.title
    );
    const content = finalizeContentForElement(result.content, element);
    return { ...result, content };
  } catch {
    const fallbackQueries = [element.title, element.description, `${element.title}. ${element.description}`].filter(
      Boolean
    );
    const { retrieveProjectChunksMulti, formatProjectChunksForPrompt } = await import(
      "@/lib/project-rag-retrieve"
    );
    const chunks = await retrieveProjectChunksMulti(sessionId, fallbackQueries, {
      topK: 16,
      maxRetrievedChars: 20_000,
    });
    if (chunks.length === 0) {
      return { content: "", method: "llm_first:timeout", confidence: "low" };
    }
    const context = formatProjectChunksForPrompt(chunks);
    const response = await chatCompletion(
      [
        { role: "system", content: EXTRACT_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Elemento: "${element.title}"\nDescripción: ${element.description}${extraHints ? `\n${extraHints}` : ""}\n\nFragmentos:\n${context}\n\nResponde JSON.`,
        },
      ],
      { max_tokens: 4096, temperature: 0.1, useCase: "extract" }
    );
    const parsed = parseExtractJson(response?.trim() ?? "");
    const content = finalizeContentForElement(parsed.content, element);
    return { content, method: "llm_first:fallback", confidence: parsed.confidence };
  }
}

export { executeProjectExtractTool, searchProjectForQuery } from "@/lib/project-extract-tools";
