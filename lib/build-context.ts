import { getConfig } from "@/lib/db";
import { extractTextFromFile } from "@/lib/document-parser";
import { getKnowledgeDocuments } from "@/lib/knowledge-loader";
import { hasChunks } from "@/lib/vector-store";
import { retrieveRelevantChunks, type RetrievedChunk } from "@/lib/rag-retrieve";
import { retrieveChunksForPrintedPage } from "@/lib/page-lookup";
import { getChapterContextForEvaluation } from "@/lib/chapter-lookup";
import {
  CONTEXT_LIMITS,
  RAG_QUERY_PROMPT_CHARS,
  RAG_QUERY_RUBRIC_CHARS,
  type ContextMode,
} from "@/lib/rag-limits";
import path from "path";
import fs from "fs";

const MAX_PROJECT_SECTION_CHARS = 18_000;
const MAX_STRUCTURED_SUMMARY_CHARS = 16_000;

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

export type ProjectStructuredData = {
  files: Array<{
    fileName: string;
    sheets: Array<{
      sheetName: string;
      cells: Array<{ row: number; col: number; value: string }>;
    }>;
  }>;
};

function formatStructuredDataSummary(data: ProjectStructuredData, maxChars: number): string {
  const parts: string[] = [];
  for (const file of data.files ?? []) {
    parts.push(`### Archivo: ${file.fileName}`);
    for (const sheet of file.sheets ?? []) {
      parts.push(`\n#### Hoja: ${sheet.sheetName}\n`);
      const cells = (sheet.cells ?? []).slice();
      cells.sort((a, b) => a.row - b.row || a.col - b.col);
      for (const c of cells) {
        parts.push(`(fila ${c.row}, col ${c.col}): ${String(c.value ?? "").trim()}\n`);
      }
    }
  }
  const out = parts.join("");
  return out.length > maxChars ? out.slice(0, maxChars) + "\n\n[Contenido truncado por límite de longitud.]" : out;
}

export type BuildSystemContextOptions = {
  projectElementsTable?: { element: string; content: string }[];
  projectStructuredData?: ProjectStructuredData;
  skipKnowledge?: boolean;
  projectElementsOnly?: boolean;
  excludeReportFormat?: boolean;
  /** Modo de límites RAG y contexto. */
  contextMode?: ContextMode;
  /** Query para recuperación RAG (pregunta del usuario o dimensión de evaluación). */
  ragQuery?: string;
  excludeChunkIds?: Set<string>;
  pageNumber?: number;
  chapterNumber?: number;
  /** En evaluación multi-dimensión: enfoque en una sola dimensión. */
  evaluateDimension?: { name: string; content: string };
  /** Callback con chunks recuperados (p. ej. deduplicación en evaluación). */
  onRetrievedChunks?: (chunks: RetrievedChunk[]) => void;
};

function buildDefaultRagQuery(
  promptForInstructions: string,
  rubricText: string,
  extra?: string
): string {
  return [
    promptForInstructions.slice(0, RAG_QUERY_PROMPT_CHARS),
    rubricText.slice(0, RAG_QUERY_RUBRIC_CHARS),
    extra ?? "Evaluar proyecto según rúbrica y documentación de referencia Manual Oslo innovación.",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function formatKnowledgeChunks(
  chunks: Array<{ docName: string; text: string; page?: number; printedPage?: number }>
): string {
  return chunks
    .map((c) => {
      const pageLabel =
        c.printedPage != null
          ? ` (página impresa ${c.printedPage})`
          : c.page != null
            ? ` (pág. PDF ${c.page})`
            : "";
      return `### Documento: ${c.docName}${pageLabel}\n\n${c.text}`;
    })
    .join("\n\n---\n\n");
}

export async function buildSystemContext(
  evaluationTypeId: number,
  projectFilePaths: string[] = [],
  options?: BuildSystemContextOptions
): Promise<string> {
  const config = await getConfig(evaluationTypeId);
  if (!config) return "";

  const mode: ContextMode = options?.contextMode ?? "chat-project";
  const limits = CONTEXT_LIMITS[mode];
  const maxSystemChars = limits.maxSystemChars;
  const pageLookup =
    options?.pageNumber != null &&
    !options?.skipKnowledge &&
    (mode === "chat-knowledge" || mode === "chat-project" || mode === "chat-chapter");

  const chapterLookup =
    options?.chapterNumber != null &&
    options?.pageNumber == null &&
    !options?.skipKnowledge &&
    (mode === "chat-chapter" || mode === "chat-knowledge" || mode === "chat-project");

  // Modo capítulo: fragmentos contiguos del capítulo (sin rúbrica ni instrucciones).
  if (chapterLookup && hasChunks(evaluationTypeId)) {
    const targetChapter = options!.chapterNumber!;
    const chapterCtx = getChapterContextForEvaluation(
      evaluationTypeId,
      targetChapter,
      limits.maxRetrievedChars
    );
    if (chapterCtx && chapterCtx.chunks.length > 0) {
      options?.onRetrievedChunks?.(chapterCtx.chunks);
      return [
        `## Capítulo ${targetChapter} del manual de referencia`,
        "",
        chapterCtx.rules,
        "",
        "## Texto del capítulo (fragmentos indexados)",
        "",
        "REGLA: Sigue el «Formato obligatorio de la respuesta» e incluye todas las secciones del índice con encabezado y párrafo propios. No omitas secciones ni uses solo la etiqueta «resumen anticipado». No uses la rúbrica IGIP. No inventes contenido.",
        "",
        formatKnowledgeChunks(chapterCtx.chunks),
      ].join("\n");
    }
    return [
      `## Capítulo ${targetChapter} del manual`,
      "",
      `No se encontraron fragmentos indexados del Capítulo ${targetChapter}.`,
      "Indica al usuario que verifique el número de capítulo e intente reindexar el knowledge si el manual fue actualizado.",
      "No inventes ni uses la rúbrica de evaluación para responder.",
    ].join("\n");
  }

  // Modo página: solo fragmentos del manual para esa página (sin rúbrica ni instrucciones).
  if (pageLookup && hasChunks(evaluationTypeId)) {
    const targetPage = options!.pageNumber!;
    const pageChunks = retrieveChunksForPrintedPage(
      evaluationTypeId,
      targetPage,
      limits.maxRetrievedChars
    );
    if (pageChunks.length > 0) {
      options?.onRetrievedChunks?.(pageChunks);
      return [
        `## Contenido de la página ${targetPage} del manual de referencia`,
        "",
        "REGLA: Responde ÚNICAMENTE describiendo o citando el texto de los fragmentos siguientes. No uses la rúbrica IGIP ni criterios de evaluación del proyecto. No inventes contenido.",
        "",
        formatKnowledgeChunks(pageChunks),
      ].join("\n");
    }
    return [
      `## Página ${targetPage} del manual`,
      "",
      `No se encontraron fragmentos indexados con el contenido de la página impresa ${targetPage}.`,
      "Indica al usuario que verifique el número de página impresa (en el PDF puede diferir del número del visor).",
      "No inventes ni uses la rúbrica de evaluación para responder.",
    ].join("\n");
  }

  const parts: string[] = [];

  const instructions = (config.instructions ?? "").trim();
  const promptLegacy = (config.prompt ?? "").trim();
  const promptForInstructions = instructions || promptLegacy;
  const reportFormat = (config.report_format ?? "").trim();
  const rubricText = (config.rubric_prompt ?? "").trim();

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

  const includeFormatInSummary = !options?.excludeReportFormat;
  const configSummary = [
    "**Instrucciones de evaluación:**",
    promptForInstructions ? promptForInstructions : "Vacío. No hay instrucciones configuradas para este tipo de evaluación.",
    "",
    ...(includeFormatInSummary
      ? ["**Formato del informe:**", reportFormat ? reportFormat : "Vacío. No hay formato de informe configurado.", ""]
      : []),
    "**Rúbrica:**",
    rubricText ? "Configurada (ver sección 'Rúbrica y criterios de evaluación' más abajo)." : "No configurada.",
    "",
    "**Elementos a identificar en el proyecto** (lo que se extrae y se muestra en 'Proyecto extraído'):",
    elementsConfigText,
    "",
    "REGLA: Si el usuario pregunta por las instrucciones, el formato del informe o los elementos a identificar, responde ÚNICAMENTE con lo indicado en esta sección. No confundas instrucciones con rúbrica. No inventes pasos, secciones (A,B,C,D), subdimensiones ni criterios a partir del manual de referencia.",
  ].join("\n");

  parts.push("## Configuración actual de este tipo de evaluación\n\n" + configSummary);

  if (options?.evaluateDimension) {
    parts.push(
      `## Enfoque de esta evaluación parcial\n\nEvalúa ÚNICAMENTE la dimensión **${options.evaluateDimension.name}**. Fundamenta el análisis en los fragmentos del Manual de referencia (Knowledge) incluidos abajo y en los datos del proyecto.\n\n### Criterios de esta dimensión\n\n${options.evaluateDimension.content}`
    );
  }

  if (promptForInstructions) {
    parts.push("## Instrucciones de evaluación\n\n" + promptForInstructions);
  }

  if (reportFormat && !options?.excludeReportFormat) {
    parts.push("## Formato del informe\n\n" + reportFormat);
  }

  const projectElementsTable = options?.projectElementsTable;
  if (projectElementsTable && projectElementsTable.length > 0) {
    const tableText = projectElementsTable
      .map((r) => `**${r.element}:**\n${r.content}`)
      .join("\n\n");
    parts.push("## Documentos del proyecto a evaluar (elementos identificados)\n\n" + tableText);
  }
  if (options?.projectStructuredData?.files?.length) {
    const summary = formatStructuredDataSummary(options.projectStructuredData, MAX_STRUCTURED_SUMMARY_CHARS);
    parts.push(
      "## Datos completos del documento (todas las hojas)\n\nUsa esta sección para responder preguntas sobre cualquier hoja del archivo (por ejemplo plan de actividades, Gantt, presupuesto, indicadores). Contiene el contenido de todas las hojas extraídas.\n\n" +
        summary
    );
  }
  if (!projectElementsTable?.length && !options?.projectStructuredData?.files?.length && !options?.projectElementsOnly && projectFilePaths.length > 0) {
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

  const rubricSectionText = rubricText
    ? rubricText
    : `No hay rúbrica de evaluación configurada para este tipo de evaluación.

REGLA para preguntas sobre rúbrica o criterios: Responde únicamente que no hay rúbrica definida en la configuración actual.`;

  const skipKnowledge =
    options?.skipKnowledge === true || limits.skipKnowledge;

  if (!skipKnowledge && hasChunks(evaluationTypeId)) {
    try {
      const ragQuery =
        options?.ragQuery?.trim() ||
        buildDefaultRagQuery(promptForInstructions, rubricText);
      const chunks = await retrieveRelevantChunks(evaluationTypeId, ragQuery, {
        topK: limits.topK,
        maxRetrievedChars: limits.maxRetrievedChars,
        excludeIds: options?.excludeChunkIds,
        pageNumber: options?.pageNumber,
      });
      if (chunks.length > 0) {
        options?.onRetrievedChunks?.(chunks);
        const knowledgeSection =
          "## Documentación de referencia (Knowledge)\n\n" +
          "REGLA: Fundamenta tu respuesta en estos fragmentos del manual de referencia cuando sea pertinente. Cita conceptos del marco teórico cuando apliquen.\n\n" +
          formatKnowledgeChunks(chunks);
        parts.push(knowledgeSection);
      }
    } catch {
      /* fallback below */
    }
  }

  if (!skipKnowledge && !parts.some((p) => p.startsWith("## Documentación de referencia"))) {
    const docs = await getKnowledgeDocuments(evaluationTypeId);
    if (docs.length > 0) {
      const maxFallback = Math.min(40_000, limits.maxRetrievedChars * 2);
      const knowledgeTexts = docs.map((d) => {
        const t = d.text.length > maxFallback ? d.text.slice(0, maxFallback) + "\n[…truncado]" : d.text;
        return `### Documento: ${d.docName}\n\n${t}`;
      });
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
  const focusPart = parts.find((p) => p.startsWith("## Enfoque de esta evaluación"));

  const otherLen =
    (promptPart?.length ?? 0) +
    (reportFormatPart?.length ?? 0) +
    (rubricPart?.length ?? 0) +
    (projectPart?.length ?? 0) +
    (focusPart?.length ?? 0) +
    separator.length * Math.max(0, parts.length - 1);
  const truncationNotice = "\n\n[Documentación de referencia truncada por límite de longitud.]";
  if (knowledgePart && otherLen + knowledgePart.length + truncationNotice.length > maxSystemChars) {
    const maxKnowledgeLen = maxSystemChars - otherLen - truncationNotice.length;
    if (maxKnowledgeLen > 0) {
      const idx = parts.indexOf(knowledgePart);
      parts[idx] = knowledgePart.slice(0, maxKnowledgeLen) + truncationNotice;
    }
  }

  let fullContext = parts.join(separator);
  const truncationSuffix = "\n\n[Contexto truncado por límite de longitud.]";
  if (fullContext.length > maxSystemChars) {
    fullContext = fullContext.slice(0, maxSystemChars - truncationSuffix.length) + truncationSuffix;
  }
  return fullContext;
}
