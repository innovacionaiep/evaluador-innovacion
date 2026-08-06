import path from "path";
import { getEvaluationTypeById } from "@/lib/db";
import { getSupportedExtensions } from "@/lib/document-parser";

export const KNOWLEDGE_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/octet-stream",
];

const ALLOWED_EXT = new Set(getSupportedExtensions());

export type KnowledgeClientPayload = { kind?: string; evaluationTypeId?: number };

/** Pure path checks (no DB). Rejects traversal and wrong prefixes. */
export function assertKnowledgeUploadPathname(pathname: string, typeId: number): void {
  const slashNormalized = pathname.replace(/\\/g, "/");
  const norm = path.posix.normalize(slashNormalized);
  const expectedPrefix = `knowledge/${typeId}/`;

  if (norm.includes("..") || !norm.startsWith(expectedPrefix)) {
    throw new Error("Ruta de subida inválida");
  }
  // Reject paths that normalize away from the declared pathname (traversal tricks)
  if (slashNormalized.includes("..")) {
    throw new Error("Ruta de subida inválida");
  }

  const ext = path.extname(norm).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error("Tipo de archivo no permitido");
  }
}

export function parseKnowledgeClientPayload(clientPayload: string | null): KnowledgeClientPayload {
  try {
    return JSON.parse(clientPayload ?? "{}") as KnowledgeClientPayload;
  } catch {
    throw new Error("Payload de subida inválido");
  }
}

export async function validateKnowledgeUploadPath(
  pathname: string,
  clientPayload: string | null
): Promise<{ typeId: number; tokenPayload: string | null }> {
  const payload = parseKnowledgeClientPayload(clientPayload);

  if (payload.kind !== "knowledge" || !Number.isInteger(payload.evaluationTypeId)) {
    throw new Error("evaluationTypeId requerido para subir knowledge");
  }

  const typeId = payload.evaluationTypeId!;
  const type = await getEvaluationTypeById(typeId);
  if (!type) throw new Error("Tipo de evaluación no encontrado");

  assertKnowledgeUploadPathname(pathname, typeId);

  return { typeId, tokenPayload: clientPayload };
}
