/** Utilidades de texto puras (sin dependencias de servidor ni IA). */

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fuzzyMatchScore(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const aTokens = new Set(na.split(" ").filter((t) => t.length >= 3));
  const bTokens = nb.split(" ").filter((t) => t.length >= 3);
  if (bTokens.length === 0) return 0;
  let hits = 0;
  for (const t of bTokens) {
    if (aTokens.has(t)) hits += 1;
  }
  return hits / bTokens.length;
}
