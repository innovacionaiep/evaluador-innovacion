export type EvaluationMode = "individual" | "bulk";

export const BULK_PROJECT_EXTENSIONS = [".xlsx", ".xls", ".pdf", ".doc", ".docx"] as const;

const BULK_EXT_SET = new Set<string>(BULK_PROJECT_EXTENSIONS);

/** Archivos de sistema / temporales que el explorador incluye al elegir carpeta. */
const BULK_IGNORED_NAMES = new Set([
  "desktop.ini",
  "thumbs.db",
  ".ds_store",
]);

function bulkFileBaseName(file: File): string {
  const rel = file.webkitRelativePath || file.name;
  return rel.replace(/^.*[/\\]/, "");
}

export function isBulkIgnoredFile(file: File): boolean {
  const base = bulkFileBaseName(file);
  const lower = base.toLowerCase();
  if (BULK_IGNORED_NAMES.has(lower)) return true;
  // Bloqueo temporal de Excel (~$archivo.xlsx), suele estar oculto
  if (base.startsWith("~$")) return true;
  if (base.startsWith(".")) return true;
  return false;
}

export function isBulkProjectFile(file: File): boolean {
  if (isBulkIgnoredFile(file)) return false;
  const name = bulkFileBaseName(file).toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return BULK_EXT_SET.has(name.slice(dot));
}

export function filterBulkProjectFiles(files: File[]): File[] {
  return files.filter(isBulkProjectFile).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Cuenta archivos ignorados al filtrar una selección de carpeta. */
export function countBulkIgnoredFiles(files: File[]): number {
  return files.filter((f) => !isBulkProjectFile(f)).length;
}

export function fileBaseName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, "");
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}
