import { getConfig } from "@/lib/db";
import { extractTextFromFile } from "@/lib/document-parser";
import { getKnowledgeDocuments } from "@/lib/knowledge-loader";
import { hasChunks } from "@/lib/vector-store";
import { retrieveRelevantChunks } from "@/lib/rag-retrieve";
import path from "path";
import fs from "fs";
import os from "os";

/** Max system context length (chars) to stay within model context + completion (e.g. 6000 TPM). */
const MAX_SYSTEM_CONTEXT_CHARS = 24_000;
/** Max chars for project section so objectives block is not pushed out by truncation. */
const MAX_PROJECT_SECTION_CHARS = 18_000;
/** Extract OBJETIVO GENERAL + OBJETIVOS ESPECÍFICOS block and rest of text (no duplication). */
function extractObjectivesAndRest(text: string): { block: string | null; rest: string } {
  const gen = /OBJETIVO\s+GENERAL\s*:?\s*/i;
  const esp = /OBJETIVOS\s+ESPECÍFICOS\s*:?\s*/i;
  const idxGen = text.search(gen);
  const idxEsp = text.search(esp);
  const start = Math.min(idxGen >= 0 ? idxGen : 1e9, idxEsp >= 0 ? idxEsp : 1e9);
  if (start >= 1e9) return { block: null, rest: text };
  const blockLen = 3200;
  const block = text.slice(start, start + blockLen).trim() || null;
  const rest = (text.slice(0, start).trim() + "\n\n" + text.slice(start + blockLen).trim()).trim();
  return { block, rest };
}
const RAG_QUERY_PROMPT_CHARS = 500;
const RAG_QUERY_RUBRIC_CHARS = 500;
const RAG_TOP_K = 20;
const RAG_MAX_RETRIEVED_CHARS = 18_000;

export type BuildSystemContextOptions = {
  projectElementsTable?: { element: string; content: string }[];
  /** Si true, no se incluye la documentación de referencia (Knowledge). Útil en el chat cuando instrucciones y rúbrica están vacías para que el LLM no cite el manual como si fuera la configuración. */
  skipKnowledge?: boolean;
};

export async function buildSystemContext(
  evaluationTypeId: number,
  projectFilePaths: string[] = [],
  options?: BuildSystemContextOptions
): Promise<string> {
  const config = await getConfig(evaluationTypeId);
  if (!config) return "";

  const parts: string[] = [];

  const instructions = (config.instructions ?? "").trim();
  const promptLegacy = (config.prompt ?? "").trim();
  const promptForInstructions = instructions || promptLegacy;
  const reportFormat = (config.report_format ?? "").trim();
  const rubricText = (config.rubric_prompt ?? "").trim();

  // Configuración actual: para que el chat responda según lo realmente configurado (instrucciones, formato, elementos).
  const elementsRaw = config.elements ?? "[]";
  let elementsList: { title?: string; description?: string; section?: string }[] = [];
  try {
    elementsList = JSON.parse(elementsRaw) as { title?: string; description?: string; section?: string }[];
    if (!Array.isArray(elementsList)) elementsList = [];
  } catch {
    elementsList = [];
  }
  const elementsBySection = elementsList.reduce(
    (acc, el) => {
      const section = (el.section ?? "General").trim() || "General";
      if (!acc[section]) acc[section] = [];
      acc[section].push({ title: el.title ?? "", description: el.description ?? "" });
      return acc;
    },
    {} as Record<string, { title: string; description: string }[]>
  );
  const elementsConfigText =
    Object.keys(elementsBySection).length === 0
      ? "Ninguno configurado."
      : Object.entries(elementsBySection)
          .map(
            ([sec, items]) =>
              `**${sec}:**\n` +
              items.map((e) => `- ${e.title || "(sin nombre)"}${e.description ? `: ${e.description}` : ""}`).join("\n")
          )
          .join("\n\n");

  const configSummary = [
    "**Instrucciones de evaluación:**",
    promptForInstructions ? promptForInstructions : "Vacío. No hay instrucciones configuradas para este tipo de evaluación.",
    "",
    "**Formato del informe:**",
    reportFormat ? reportFormat : "Vacío. No hay formato de informe configurado.",
    "",
    "**Rúbrica:**",
    rubricText ? "Configurada (ver sección 'Rúbrica y criterios de evaluación' más abajo)." : "No configurada.",
    "",
    "**Elementos a identificar en el proyecto** (lo que se extrae y se muestra en 'Proyecto extraído'):",
    elementsConfigText,
    "",
    "REGLA: Si el usuario pregunta por las instrucciones, el formato del informe o los elementos a identificar, responde ÚNICAMENTE con lo indicado en esta sección. No confundas instrucciones con rúbrica. No inventes pasos, secciones (A,B,C,D), subdimensiones ni criterios a partir del manual de referencia.",
  ].join("\n");

  parts.push("## Configuración actual de este tipo de evaluación\n\n" + configSummary);

  if (promptForInstructions) {
    parts.push("## Instrucciones de evaluación\n\n" + promptForInstructions);
  }

  if (reportFormat) {
    parts.push("## Formato del informe\n\n" + reportFormat);
  }

  const projectElementsTable = options?.projectElementsTable;
  if (projectElementsTable && projectElementsTable.length > 0) {
    const tableText = projectElementsTable
      .map((r) => `**${r.element}:**\n${r.content}`)
      .join("\n\n");
    parts.push("## Documentos del proyecto a evaluar (elementos identificados)\n\n" + tableText);
  } else if (projectFilePaths.length > 0) {
    const projectTexts: string[] = [];
    for (const filePath of projectFilePaths) {
      if (!fs.existsSync(filePath)) continue;
      const text = await extractTextFromFile(filePath);
      if (!text) continue;
      const { block: objectivesBlock, rest } = extractObjectivesAndRest(text);
      const restMax = MAX_PROJECT_SECTION_CHARS - (objectivesBlock?.length ?? 0) - 200;
      const restTruncated =
        rest.length > restMax ? rest.slice(0, restMax) + "\n\n[Contenido truncado…]" : rest;
      const display =
        objectivesBlock != null
          ? `### Archivo: ${path.basename(filePath)}\n\n**Objetivos (texto del documento):**\n\n${objectivesBlock}\n\n---\n\n**Resto del contenido:**\n\n${restTruncated}`
          : `### Archivo: ${path.basename(filePath)}\n\n${restTruncated}`;
      projectTexts.push(display);
    }
    if (projectTexts.length > 0) {
      parts.push("## Documentos del proyecto a evaluar\n\n" + projectTexts.join("\n\n---\n\n"));
    }
  }

  // Solo usar rúbrica si el usuario escribió algo en el campo "Rúbrica". No cargar desde
  // rubric_path cuando el campo está vacío, para no inyectar rúbricas residuales.
  // Cuando no hay rúbrica configurada, indicarlo explícitamente para que el modelo no
  // use la documentación de referencia como rúbrica ni invente criterios.
  const rubricSectionText = rubricText
    ? rubricText
    : `No hay rúbrica de evaluación configurada para este tipo de evaluación.

REGLA para preguntas sobre rúbrica o criterios: Responde únicamente que no hay rúbrica definida en la configuración actual. No describas ni sugieras ninguna estructura de evaluación (no menciones dimensiones como Novedad, Impacto, Escalabilidad, Resultado Final, ni niveles 1-4, ni subdimensiones, ni ponderaciones). No pidas al usuario que proporcione o cargue una rúbrica. No uses la documentación de referencia como rúbrica. En las evaluaciones no se aplica ninguna rúbrica si no está configurada.`;

  const skipKnowledge = options?.skipKnowledge === true;

  if (!skipKnowledge && hasChunks(evaluationTypeId)) {
    try {
      const queryText = [
        promptForInstructions.slice(0, RAG_QUERY_PROMPT_CHARS),
        rubricText.slice(0, RAG_QUERY_RUBRIC_CHARS),
        "Evaluar proyecto según rúbrica y documentación de referencia.",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      const chunks = await retrieveRelevantChunks(evaluationTypeId, queryText, {
        topK: RAG_TOP_K,
        maxRetrievedChars: RAG_MAX_RETRIEVED_CHARS,
      });
      if (chunks.length > 0) {
        const knowledgeSection =
          "## Documentación de referencia (Knowledge)\n\n" +
          chunks
            .map((c) => `### Documento: ${c.docName}\n\n${c.text}`)
            .join("\n\n---\n\n");
        parts.push(knowledgeSection);
      }
    } catch {
      /* fallback to full knowledge load below */
    }
  }

  if (!skipKnowledge && !parts.some((p) => p.startsWith("## Documentación de referencia"))) {
    const docs = await getKnowledgeDocuments(evaluationTypeId);
    if (docs.length > 0) {
      const knowledgeTexts = docs.map((d) => `### Documento: ${d.docName}\n\n${d.text}`);
      parts.push("## Documentación de referencia (Knowledge)\n\n" + knowledgeTexts.join("\n\n---\n\n"));
    }
  }

  parts.push("## Rúbrica y criterios de evaluación\n\n" + rubricSectionText);

  const separator = "\n\n---\n\n";
  const promptPart = parts.find((p) => p.startsWith("## Instrucciones de evaluación"));
  const reportFormatPart = parts.find((p) => p.startsWith("## Formato del informe"));
  const projectPart = parts.find((p) => p.startsWith("## Documentos del proyecto"));
  const knowledgePart = parts.find((p) => p.startsWith("## Documentación de referencia"));
  const rubricPart = parts.find((p) => p.startsWith("## Rúbrica"));

  const otherLen =
    (promptPart?.length ?? 0) +
    (reportFormatPart?.length ?? 0) +
    (rubricPart?.length ?? 0) +
    (projectPart?.length ?? 0) +
    separator.length * Math.max(0, parts.length - 1);
  const truncationNotice = "\n\n[Documentación de referencia truncada por límite de longitud.]";
  if (
    knowledgePart &&
    otherLen + knowledgePart.length + truncationNotice.length > MAX_SYSTEM_CONTEXT_CHARS
  ) {
    const maxKnowledgeLen = MAX_SYSTEM_CONTEXT_CHARS - otherLen - truncationNotice.length;
    if (maxKnowledgeLen > 0) {
      const idx = parts.indexOf(knowledgePart);
      parts[idx] =
        knowledgePart.slice(0, maxKnowledgeLen) + truncationNotice;
    }
  }

  let fullContext = parts.join(separator);
  const truncationSuffix = "\n\n[Contexto truncado por límite de longitud.]";
  if (fullContext.length > MAX_SYSTEM_CONTEXT_CHARS) {
    fullContext = fullContext.slice(0, MAX_SYSTEM_CONTEXT_CHARS - truncationSuffix.length) + truncationSuffix;
  }
  return fullContext;
}
