import { NextResponse } from "next/server";
import { getConfig } from "@/lib/db";
import { buildSystemContext, type ProjectStructuredData } from "@/lib/build-context";
import { streamChatDetailed } from "@/lib/openrouter";
import {
  classifyChatIntent,
  chatIntentToContextMode,
  parsePageFromQuery,
  parseChapterFromQuery,
} from "@/lib/chat-intent";
import type { ContextMode } from "@/lib/rag-limits";
import { INTENT_LABELS, type ChatStreamEvent } from "@/lib/agent-events";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CONFIG_RULE =
  "REGLA OBLIGATORIA (configuración): Si preguntan por las INSTRUCCIONES de evaluación, el FORMATO del informe o los ELEMENTOS A IDENTIFICAR del proyecto, responde ÚNICAMENTE con lo que dice la sección 'Configuración actual de este tipo de evaluación'. No uses el manual de referencia ni inventes contenido. Si ahí dice 'Vacío' o 'Ninguno configurado', responde eso.\n\n";

const NO_RUBRIC_RULE =
  "REGLA OBLIGATORIA (solo para rúbrica): No hay rúbrica configurada. Si preguntan específicamente por la rúbrica o los criterios de evaluación (no por las instrucciones ni por los elementos a identificar), responde SOLO: «No hay rúbrica definida en la configuración actual.» No confundas instrucciones con rúbrica: son cosas distintas.\n\n";

const MAX_HISTORY_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 2000;

const INTENT_HINTS: Record<string, string> = {
  config:
    "El usuario pregunta sobre la CONFIGURACIÓN (instrucciones, formato, elementos o rúbrica configurada). Responde solo desde las secciones de configuración.\n\n",
  knowledge:
    "El usuario pregunta sobre el MANUAL / KNOWLEDGE de referencia.\n\n",
  project:
    "El usuario pregunta sobre el PROYECTO subido. Prioriza 'Documentos del proyecto a evaluar' y datos del Excel.\n\n",
};

const pageQuestionRule = (page: number) =>
  `REGLA OBLIGATORIA (página ${page}): El usuario pide el contenido de la página ${page} del Manual de referencia. Responde SOLO con lo que aparece en los fragmentos del Knowledge de esa página. PROHIBIDO usar la rúbrica IGIP, notas 1-4, Novedad, Impacto o Escalabilidad. Si el texto no está en los fragmentos, dilo sin inventar. No añadas notas meta al final sobre fragmentos o knowledge.\n\n`;

const chapterQuestionRule = (chapter: number) =>
  `REGLA OBLIGATORIA (capítulo ${chapter}): Resumen del Capítulo ${chapter}. Sigue el «Formato obligatorio de la respuesta» del system prompt: un encabezado ### por cada sección del índice, en orden, con 2–5 oraciones bajo cada uno. PROHIBIDO omitir secciones (p. ej. saltar de ${chapter}.1.4 a ${chapter}.3 sin ${chapter}.2). PROHIBIDO fusionar encabezados o poner solo «resumen anticipado» en lugar del contenido. Si una subsección anticipa otro capítulo, dilo dentro de su párrafo. PROHIBIDO usar la rúbrica. Sin notas finales sobre fragmentos o knowledge.\n\n`;

const knowledgeGroundingRule =
  "REGLA OBLIGATORIA (knowledge): Responde con información de la sección «Documentación de referencia (Knowledge)». Extrae primero el máximo detalle metodológico disponible en los fragmentos (encuestas, definiciones, pasos de recolección). PROHIBIDO inventar tablas, métricas o páginas. Si los fragmentos son incompletos, resume lo que sí aparece antes de decir qué falta. No rellenes con conocimiento general del modelo.\n\n";

function emit(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, event: ChatStreamEvent) {
  controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const evaluationTypeId = Number(body?.evaluationTypeId);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const projectFilePaths = Array.isArray(body?.projectFilePaths)
      ? (body.projectFilePaths as string[]).filter((p: unknown) => typeof p === "string")
      : [];
    const projectElementsTable = Array.isArray(body?.projectElementsTable)
      ? (body.projectElementsTable as { element?: string; content?: string }[]).filter(
          (r) => r && typeof r.element === "string"
        ).map((r) => ({ element: r.element!, content: typeof r.content === "string" ? r.content : "" }))
      : undefined;
    const projectStructuredData =
      body?.projectStructuredData &&
      Array.isArray((body.projectStructuredData as { files?: unknown }).files) &&
      (body.projectStructuredData as { files: unknown[] }).files.length > 0
        ? (body.projectStructuredData as ProjectStructuredData)
        : undefined;
    const historyRaw = Array.isArray(body?.messages)
      ? (body.messages as { role: string; content: string }[]).filter(
          (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
        )
      : [];
    const history = historyRaw
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

    if (!Number.isInteger(evaluationTypeId) || evaluationTypeId < 1) {
      return NextResponse.json({ error: "evaluationTypeId required" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const config = await getConfig(evaluationTypeId);
    const hasRubric = !!((config?.rubric_prompt ?? "").trim());
    const hasInstructions = !!((config?.instructions ?? "").trim() || (config?.prompt ?? "").trim());
    const hasProjectData =
      !!(projectElementsTable?.length || projectStructuredData?.files?.length);

    const pageNumber = parsePageFromQuery(message);
    const chapterNumber = pageNumber == null ? parseChapterFromQuery(message) : undefined;
    const intent =
      pageNumber != null || chapterNumber != null
        ? "knowledge"
        : classifyChatIntent(message, hasProjectData);
    const contextMode: ContextMode =
      chapterNumber != null
        ? "chat-chapter"
        : chatIntentToContextMode(intent);

    const skipKnowledgeLegacy = !hasInstructions && !hasRubric;
    const ragQuery =
      intent === "config"
        ? undefined
        : pageNumber != null
          ? `Manual Oslo página ${pageNumber} chapter section content`
          : chapterNumber != null
            ? `Manual Oslo Chapter ${chapterNumber} capítulo ${chapterNumber} resumen`
            : message;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          emit(controller, encoder, {
            type: "step",
            phase: "intent",
            message: "Analizando la pregunta y eligiendo fuentes de contexto…",
          });
          emit(controller, encoder, {
            type: "intent",
            intent,
            contextMode,
            label: INTENT_LABELS[intent] ?? intent,
          });

          const systemContent = await buildSystemContext(evaluationTypeId, projectFilePaths, {
            projectElementsTable: projectElementsTable?.length ? projectElementsTable : undefined,
            projectStructuredData,
            skipKnowledge:
              intent === "config" ||
              (skipKnowledgeLegacy && intent === "project" && chapterNumber == null && pageNumber == null),
            projectElementsOnly: true,
            contextMode,
            ragQuery,
            pageNumber,
            chapterNumber,
            onStreamEvent: (event) => emit(controller, encoder, event),
          });

          const languageInstruction =
            "Responde siempre en español. Todas tus respuestas deben estar escritas íntegramente en español.\n\n";
          const baseInstruction =
            "Eres un asistente experto en evaluación de proyectos. Responde con claridad y basándote en la documentación y rúbrica cuando estén disponibles.\n\nREGLA OBLIGATORIA para objetivos: Si preguntan por el objetivo general o los objetivos específicos del proyecto, cita ÚNICAMENTE el texto de la sección del proyecto. No parafrasees.\n\nNo uses nunca las etiquetas <think> ni </think> en tus respuestas.";
          const noRubricPrefix = !hasRubric ? NO_RUBRIC_RULE : "";
          const pageRule = pageNumber != null ? pageQuestionRule(pageNumber) : "";
          const chapterRule = chapterNumber != null ? chapterQuestionRule(chapterNumber) : "";
          const focusedKnowledgeQuery = pageNumber != null || chapterNumber != null;
          const knowledgeRule =
            intent === "knowledge" && !focusedKnowledgeQuery ? knowledgeGroundingRule : "";
          const intentHint = focusedKnowledgeQuery ? "" : INTENT_HINTS[intent] ?? "";
          const configRuleForPage = focusedKnowledgeQuery ? "" : CONFIG_RULE;
          const systemMessage =
            configRuleForPage +
            pageRule +
            chapterRule +
            knowledgeRule +
            noRubricPrefix +
            intentHint +
            languageInstruction +
            (systemContent || baseInstruction);

          const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
            { role: "system", content: systemMessage },
            ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
            { role: "user", content: message },
          ];

          emit(controller, encoder, {
            type: "step",
            phase: "llm",
            message: "Generando respuesta con el modelo de lenguaje…",
          });

          let hasThinking = false;
          let hasContent = false;

          for await (const part of streamChatDetailed(messages)) {
            if (part.kind === "thinking") {
              if (!hasThinking) {
                emit(controller, encoder, {
                  type: "step",
                  phase: "thinking",
                  message: "El modelo está razonando antes de responder…",
                });
                hasThinking = true;
              }
              emit(controller, encoder, { type: "thinking", chunk: part.text });
            } else {
              if (!hasContent && part.text.trim()) {
                emit(controller, encoder, {
                  type: "step",
                  phase: "answer",
                  message: "Redactando la respuesta final…",
                });
                hasContent = true;
              }
              emit(controller, encoder, { type: "content", chunk: part.text });
            }
          }

          emit(controller, encoder, { type: "done" });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          emit(controller, encoder, { type: "error", error: errMsg });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
