/**
 * Sub-consultas para mejorar el recall en preguntas amplias sobre el manual.
 */
export function buildKnowledgeRagQueries(userMessage: string): string[] {
  const base = userMessage.trim();
  if (!base) return ["Oslo Manual innovation"];

  const queries = [base];

  if (
    /\b(c[oó]mo|de qu[eé] forma|en qu[eé]|how)\b.*\b(mide|medir|medici[oó]n|measure|measuring)\b/i.test(
      base
    ) ||
    /\b(mide|medir|medici[oó]n|measure)\b.*\binnovaci[oó]n\b/i.test(base)
  ) {
    queries.push(
      "Oslo Manual innovation survey Community Innovation Survey CIS questionnaire sample design data collection respondents",
      "Oslo Manual Part III Chapter 6 7 8 9 methods collecting analysing reporting innovation statistics",
      "measuring business innovation product innovation business process innovation innovative firm survey questions"
    );
  } else if (/\bdefinici[oó]n|qu[eé]\s+es\b.*\binnovaci[oó]n\b|concept of innovation/i.test(base)) {
    queries.push(
      "Oslo Manual Chapter 2 concept of innovation product business process novelty implementation value"
    );
  } else if (
    /\bqu[eé]\s+hay\b.*\b(knowledge|manual)\b|\bcontenido\b.*\bmanual\b|\b[ií]ndice\b/i.test(base)
  ) {
    queries.push("Oslo Manual table of contents structure parts chapters executive summary");
  } else {
    queries.push(`${base} Oslo Manual innovation measurement guidelines`);
  }

  return [...new Set(queries)];
}
