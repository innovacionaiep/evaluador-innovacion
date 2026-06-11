import type { ContextMode } from "@/lib/rag-limits";

export type ChatIntent = "config" | "knowledge" | "project";

const CONFIG_PATTERNS = [
  /\binstrucciones?\b/i,
  /\bformato\s+(del\s+)?informe\b/i,
  /\belementos?\s+a\s+identificar\b/i,
  /\bconfiguraci[oó]n\b/i,
  /\bqu[eé]\s+r[uú]brica\s+(tengo|est[aá]|configurada)\b/i,
  /\bcriterios?\s+configurados?\b/i,
  /\bqu[eé]\s+debo\s+evaluar\b/i,
];

const KNOWLEDGE_PATTERNS = [
  /\bmanual\b/i,
  /\boslo\b/i,
  /\bknowledge\b/i,
  /\bdocumento\s+de\s+referencia\b/i,
  /\bmarco\s+te[oó]rico\b/i,
  /\bp[aá]gina\s+\d+/i,
  /\bcap[ií]tulo\s+\d+/i,
  /\bseg[uú]n\s+el\s+(manual|documento|pdf)\b/i,
  /\bqu[eé]\s+(dice|define|es)\b.*\b(innovaci[oó]n|oslo|manual)\b/i,
  /\bdefinici[oó]n\s+de\s+innovaci[oó]n\b/i,
];

const PROJECT_PATTERNS = [
  /\bproyecto\b/i,
  /\bobjetivo\s+general\b/i,
  /\bobjetivos?\s+espec[ií]ficos?\b/i,
  /\bsedes?\b/i,
  /\bescuelas?\b/i,
  /\bbeneficiarios?\b/i,
  /\bpresupuesto\b/i,
  /\bgantt\b/i,
  /\bplan\s+de\s+actividades\b/i,
  /\bindicadores?\b/i,
  /\bnombre\s+del\s+proyecto\b/i,
];

/**
 * Clasifica la intención del mensaje de chat para elegir modo de contexto/RAG.
 */
export function classifyChatIntent(
  message: string,
  hasProjectData: boolean
): ChatIntent {
  const m = message.trim();
  if (!m) return hasProjectData ? "project" : "knowledge";

  const configScore = CONFIG_PATTERNS.filter((p) => p.test(m)).length;
  const knowledgeScore = KNOWLEDGE_PATTERNS.filter((p) => p.test(m)).length;
  const projectScore = PROJECT_PATTERNS.filter((p) => p.test(m)).length;

  if (configScore > 0 && configScore >= knowledgeScore && configScore >= projectScore) {
    return "config";
  }
  if (knowledgeScore > 0 && knowledgeScore >= projectScore) {
    return "knowledge";
  }
  if (hasProjectData && projectScore > 0) {
    return "project";
  }
  if (knowledgeScore > 0) return "knowledge";
  if (hasProjectData) return "project";
  return "knowledge";
}

export function chatIntentToContextMode(intent: ChatIntent): ContextMode {
  switch (intent) {
    case "config":
      return "chat-config";
    case "knowledge":
      return "chat-knowledge";
    case "project":
      return "chat-project";
  }
}

/** Extrae número de página si el usuario pregunta por "página 201", etc. */
export function parsePageFromQuery(message: string): number | undefined {
  const m = message.match(/\bp[aá]gina\s+(\d{1,4})\b/i);
  if (m) return Number(m[1]);
  return undefined;
}

/** Todos los capítulos mencionados (p. ej. "capítulo 2 ... capítulo 4" → [2, 4]). */
export function parseChaptersFromQuery(message: string): number[] {
  const found = new Set<number>();
  const patterns = [
    /\b(?:cap[ií]tulo|chapter|cap\.)\s+(\d{1,2})\b/gi,
    /\b(?:resumen|resume|resumir|sumariza)\s+(?:del?\s+)?(?:el\s+)?(?:cap[ií]tulo|chapter)\s+(\d{1,2})\b/gi,
  ];
  for (const re of patterns) {
    for (const m of message.matchAll(re)) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 99) found.add(n);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** Un solo capítulo; si hay varios mencionados devuelve undefined (usar parseChaptersFromQuery). */
export function parseChapterFromQuery(message: string): number | undefined {
  const all = parseChaptersFromQuery(message);
  return all.length === 1 ? all[0] : undefined;
}

export function isChapterComparisonQuery(message: string): boolean {
  const chapters = parseChaptersFromQuery(message);
  if (chapters.length >= 2) return true;
  return /\bcompar(a|ar|ación|ando)\b/i.test(message) && chapters.length >= 1;
}
