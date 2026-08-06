/** Pure helpers for knowledge Blob URL / path validation (safe for tests + routes). */

export function knowledgeTypePrefix(evaluationTypeId: number): string {
  return `knowledge/${evaluationTypeId}`;
}

export function isAllowedKnowledgeUrl(url: string, evaluationTypeId: number): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const prefix = `/${knowledgeTypePrefix(evaluationTypeId)}/`;
    const pathName = decodeURIComponent(u.pathname);
    return (
      pathName.includes(prefix) || pathName.includes(`${knowledgeTypePrefix(evaluationTypeId)}/`)
    );
  } catch {
    return false;
  }
}
