import { chatCompletion } from "@/lib/openrouter";
import type { ElementDef } from "@/lib/excel-heuristics";

const STRUCTURE_SYSTEM_PROMPT = `Eres un asistente que estructura tablas de indicadores de proyectos IGIP.

Recibirás datos crudos de la hoja Excel "Indicadores" (filas con etiquetas de columna).
Tu tarea es reescribirlos de forma clara y legible para un evaluador humano.

REGLAS DE FORMATO:
- Un bloque numerado por cada indicador (1, 2, 3…).
- Dentro de cada bloque usa etiquetas en líneas separadas, por ejemplo:
  **Nombre del indicador:** …
  **Objetivo general:** …
  **Objetivos específicos:** …
  **Descripción:** …
  **Forma de cálculo:** …
  **Resultado esperado:** …
  **Resultado alcanzado:** …
  **% cumplimiento / % avance:** …
  **Meta:** …
  **Evidencias / medio de verificación:** …
- Si hay filas "Meta:" asociadas a un indicador, inclúyelas dentro del mismo bloque.
- NO uses pipes (|), tablas de una sola línea ni listas compactas ilegibles.
- NO inventes datos; solo reorganiza fielmente lo que aparece en los datos crudos.
- Omite campos vacíos.
- Responde ÚNICAMENTE JSON: {"content":"...","confidence":"high|medium|low"}`;

function parseStructureJson(raw: string): { content: string; confidence: string } {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { content: trimmed, confidence: "medium" };
  try {
    const obj = JSON.parse(jsonMatch[0]) as { content?: string; confidence?: string };
    return {
      content: typeof obj.content === "string" ? obj.content : "",
      confidence: typeof obj.confidence === "string" ? obj.confidence : "medium",
    };
  } catch {
    return { content: trimmed, confidence: "low" };
  }
}

/**
 * El LLM reorganiza la tabla cruda de Indicadores en bloques legibles.
 */
export async function structureIndicatorsWithLlm(
  element: ElementDef,
  rawContext: string
): Promise<{ content: string; confidence: string }> {
  const response = await chatCompletion(
    [
      { role: "system", content: STRUCTURE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Elemento: "${element.title}"
Descripción: ${element.description}

Datos crudos de la hoja Indicadores:
${rawContext}

Estructura la información según las reglas. Responde JSON.`,
      },
    ],
    { max_tokens: 4096, temperature: 0.1, useCase: "extract" }
  );

  const parsed = parseStructureJson(response?.trim() ?? "");
  return {
    content: parsed.content.trim(),
    confidence: parsed.confidence,
  };
}
