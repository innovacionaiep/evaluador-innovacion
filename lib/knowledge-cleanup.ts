import path from "path";
import fs from "fs";
import { getKnowledgeDir } from "@/lib/storage";

export type KnowledgePathItem = string | { name: string; url: string };

export function knowledgeItemKey(item: KnowledgePathItem): string {
  return typeof item === "string" ? item : item.name;
}

/** Elimina del disco los archivos locales que ya no están en knowledge_paths. */
export function deleteRemovedLocalKnowledgeFiles(
  evaluationTypeId: number,
  previous: KnowledgePathItem[],
  next: KnowledgePathItem[]
): void {
  const nextKeys = new Set(next.map(knowledgeItemKey));
  const dir = getKnowledgeDir(evaluationTypeId);
  for (const item of previous) {
    if (typeof item !== "string") continue;
    if (nextKeys.has(item)) continue;
    const filePath = path.join(dir, path.basename(item));
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }
}
