import { getConfig } from "@/lib/db";
import {
  getKnowledgeDir,
  getRubricFilePath,
} from "@/lib/storage";
import { extractTextFromFile } from "@/lib/document-parser";
import path from "path";
import fs from "fs";
import os from "os";

/** Max system context length (chars) to stay within model context + completion. */
const MAX_SYSTEM_CONTEXT_CHARS = 120_000;

export async function buildSystemContext(
  evaluationTypeId: number,
  projectFilePaths: string[] = []
): Promise<string> {
  const config = await getConfig(evaluationTypeId);
  if (!config) return "";

  const parts: string[] = [];

  const prompt = (config.prompt || "").trim();
  if (prompt) {
    parts.push("## Instrucciones de evaluación y formato del informe\n\n" + prompt);
  }

  const knowledgePaths = (() => {
    try {
      return JSON.parse(config.knowledge_paths || "[]") as (string | { name: string; url: string })[];
    } catch {
      return [];
    }
  })();
  if (knowledgePaths.length > 0) {
    const dir = getKnowledgeDir(evaluationTypeId);
    const knowledgeTexts: string[] = [];
    for (let i = 0; i < knowledgePaths.length; i++) {
      const item = knowledgePaths[i];
      let text = "";
      let docName = "";
      if (typeof item === "object" && item?.url) {
        docName = item.name || "documento";
        try {
          const res = await fetch(item.url);
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          const tmpPath = path.join(os.tmpdir(), `kb-${Date.now()}-${i}${path.extname(docName) || ".bin"}`);
          fs.writeFileSync(tmpPath, buf);
          try {
            text = await extractTextFromFile(tmpPath);
          } finally {
            try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
          }
        } catch {
          continue;
        }
      } else if (typeof item === "string") {
        docName = item;
        const fullPath = path.join(dir, path.basename(item));
        if (!fs.existsSync(fullPath)) continue;
        text = await extractTextFromFile(fullPath);
      }
      if (text) knowledgeTexts.push(`### Documento: ${docName}\n\n${text}`);
    }
    if (knowledgeTexts.length > 0) {
      parts.push("## Documentación de referencia (Knowledge)\n\n" + knowledgeTexts.join("\n\n---\n\n"));
    }
  }

  const rubricPath = (config.rubric_path || "").trim();
  if (rubricPath) {
    if (rubricPath.startsWith("http://") || rubricPath.startsWith("https://")) {
      try {
        const res = await fetch(rubricPath);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const ext = path.extname(new URL(rubricPath).pathname) || ".bin";
          const tmpPath = path.join(os.tmpdir(), `rubric-${Date.now()}${ext}`);
          fs.writeFileSync(tmpPath, buf);
          try {
            const text = await extractTextFromFile(tmpPath);
            if (text) parts.push("## Rúbrica y criterios de evaluación\n\n" + text);
          } finally {
            try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    } else {
      const fullPath = getRubricFilePath(evaluationTypeId, rubricPath);
      if (fs.existsSync(fullPath)) {
        const text = await extractTextFromFile(fullPath);
        if (text) parts.push("## Rúbrica y criterios de evaluación\n\n" + text);
      }
    }
  }

  if (projectFilePaths.length > 0) {
    const projectTexts: string[] = [];
    for (const filePath of projectFilePaths) {
      if (!fs.existsSync(filePath)) continue;
      const text = await extractTextFromFile(filePath);
      if (text) projectTexts.push(`### Archivo: ${path.basename(filePath)}\n\n${text}`);
    }
    if (projectTexts.length > 0) {
      parts.push("## Documentos del proyecto a evaluar\n\n" + projectTexts.join("\n\n---\n\n"));
    }
  }

  const separator = "\n\n---\n\n";
  const promptPart = parts.find((p) => p.startsWith("## Instrucciones de evaluación"));
  const knowledgePart = parts.find((p) => p.startsWith("## Documentación de referencia"));
  const rubricPart = parts.find((p) => p.startsWith("## Rúbrica"));
  const projectPart = parts.find((p) => p.startsWith("## Documentos del proyecto"));

  const otherLen =
    (promptPart?.length ?? 0) +
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

  const fullContext = parts.join(separator);
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/2cfbb0df-8ae8-4230-9f25-74fe2cc0dcdd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "build-context.ts:buildSystemContext",
      message: "Context section lengths and total",
      data: {
        promptLen: promptPart?.length ?? 0,
        knowledgeLen: knowledgePart?.length ?? 0,
        rubricLen: rubricPart?.length ?? 0,
        projectLen: projectPart?.length ?? 0,
        totalChars: fullContext.length,
      },
      timestamp: Date.now(),
      hypothesisId: "H1,H3,H4",
    }),
  }).catch(() => {});
  // #endregion
  return fullContext;
}
