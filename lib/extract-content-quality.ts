import type { ElementDef } from "@/lib/excel-heuristics";
import { looksLikeContinuityAnswer } from "@/lib/extract-content-clean";
import { normalizeForMatch } from "@/lib/text-match";

/** El texto parece una pregunta de formulario, no una respuesta. */
export function looksLikeFormQuestionContent(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^[¿?]/.test(t)) return true;
  if (/\?\s*$/.test(t) && (t.includes("¿") || t.split(/\s+/).length > 4)) return true;
  if ((t.match(/\?/g) ?? []).length >= 2) return true;
  if (/^al que apunta el proyecto/i.test(t)) return true;
  if (/^c[oó]mo se integra/i.test(t) && /\?/.test(t)) return true;
  if (/^¿existen planes/i.test(t)) return true;
  return false;
}

/** Solo lista de focalizaciones (metadata), sin desarrollo narrativo. */
export function isFocalizacionKeywordList(content: string): boolean {
  const t = content.trim();
  if (!t || t.length > 200) return false;
  if (/[.!?]/.test(t) && t.length > 40) return false;
  const keywords = ["social", "medioambiental", "productivo", "ambiental"];
  const parts = t.split(/[,;]/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((p) => keywords.some((k) => p.includes(k)));
}

/** Respuesta demasiado corta o trivial para el elemento. */
export function isTrivialExtractedContent(element: ElementDef, content: string): boolean {
  const t = content.trim();
  if (!t || t === "." || t === "—") return true;
  if (t.length < 2) return true;

  const title = normalizeForMatch(element.title);
  if (/ejes?\s+de\s+impacto|focalizaci/i.test(title) && isFocalizacionKeywordList(t)) {
    return true;
  }

  if (/factor innovador|escalabilidad|sostenibilidad|resultados|objetivo de desarrollo/i.test(title)) {
    if (looksLikeFormQuestionContent(t)) return true;
    if (t.length < 15 && !/^s[ií]$/i.test(t)) return true;
    if (/factor innovador|innovador del proyecto/.test(title) && looksLikeContinuityAnswer(t)) {
      return true;
    }
  }

  if (/^no$/i.test(t) && /factor innovador|innovador/i.test(title)) {
    return true;
  }

  return false;
}

export function isAcceptableExtractedContent(element: ElementDef, content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (isTrivialExtractedContent(element, t)) return false;
  if (looksLikeFormQuestionContent(t)) return false;
  return true;
}
