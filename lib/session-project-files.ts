import path from "path";
import fs from "fs";
import {
  clearSessionProjectFiles,
  getSessionDir,
  listSessionProjectFilePaths,
} from "@/lib/storage";
import { clearProjectIndex } from "@/lib/project-vector-store";
import { getProjectUploadExtensions } from "@/lib/document-parser";

function sanitizeFilename(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Guarda archivos de proyecto en el directorio de sesión (disco local o /tmp en Vercel).
 */
export async function saveProjectFilesToSession(
  sessionId: string,
  files: File[],
  options: { replace?: boolean } = {}
): Promise<string[]> {
  const projectAllowed = new Set(getProjectUploadExtensions());
  const replace = options.replace !== false;

  if (replace) {
    clearSessionProjectFiles(sessionId, [...projectAllowed]);
    clearProjectIndex(sessionId);
  }

  const dir = getSessionDir(sessionId);
  for (const file of files) {
    if (!file?.name) continue;
    const ext = path.extname(file.name).toLowerCase();
    if (!projectAllowed.has(ext)) continue;
    const filename = sanitizeFilename(file.name);
    const filepath = path.join(dir, filename);
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buf);
  }

  return listSessionProjectFilePaths(sessionId, [...projectAllowed]);
}

/** Guarda buffers ya leídos (p. ej. desde multipart en API route). */
export function saveProjectBuffersToSession(
  sessionId: string,
  items: { name: string; buffer: Buffer }[],
  options: { replace?: boolean } = {}
): string[] {
  const projectAllowed = new Set(getProjectUploadExtensions());
  const replace = options.replace !== false;

  if (replace) {
    clearSessionProjectFiles(sessionId, [...projectAllowed]);
    clearProjectIndex(sessionId);
  }

  const dir = getSessionDir(sessionId);
  for (const { name, buffer } of items) {
    if (!name) continue;
    const ext = path.extname(name).toLowerCase();
    if (!projectAllowed.has(ext)) continue;
    const filename = sanitizeFilename(name);
    fs.writeFileSync(path.join(dir, filename), buffer);
  }

  return listSessionProjectFilePaths(sessionId, [...projectAllowed]);
}
