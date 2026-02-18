import { NextResponse } from "next/server";
import { buildSystemContext } from "@/lib/build-context";
import { streamChat } from "@/lib/groq";

export const dynamic = "force-dynamic";

const EVALUATE_USER_PROMPT = `
Genera el informe de evaluación completo según las instrucciones y la rúbrica proporcionadas. 
Incluye todas las secciones indicadas: notas por criterio, índices si aplican, y justificación.
Responde ÚNICAMENTE con el contenido del informe, sin introducciones ni comentarios previos.
`.trim();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const evaluationTypeId = Number(body?.evaluationTypeId);
    const projectFilePaths = Array.isArray(body?.projectFilePaths)
      ? (body.projectFilePaths as string[]).filter((p: unknown) => typeof p === "string")
      : [];

    if (!Number.isInteger(evaluationTypeId) || evaluationTypeId < 1) {
      return NextResponse.json({ error: "evaluationTypeId required" }, { status: 400 });
    }

    const systemContent = await buildSystemContext(evaluationTypeId, projectFilePaths);
    const systemMessage =
      systemContent ||
      "Eres un evaluador de proyectos. Genera un informe de evaluación con notas, criterios y justificación según la rúbrica.";

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemMessage },
      { role: "user", content: EVALUATE_USER_PROMPT },
    ];

    // #region agent log
    const systemContentLen = systemMessage.length;
    const userContentLen = EVALUATE_USER_PROMPT.length;
    const totalChars = systemContentLen + userContentLen;
    fetch("http://127.0.0.1:7243/ingest/2cfbb0df-8ae8-4230-9f25-74fe2cc0dcdd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "evaluate/route.ts:POST",
        message: "Messages before streamChat",
        data: { systemContentLen, userContentLen, totalChars, messageCount: messages.length },
        timestamp: Date.now(),
        hypothesisId: "H1,H2,H4",
      }),
    }).catch(() => {});
    // #endregion

    const stream = streamChat(messages);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          // #region agent log
          const errMsg = err instanceof Error ? err.message : String(err);
          fetch("http://127.0.0.1:7243/ingest/2cfbb0df-8ae8-4230-9f25-74fe2cc0dcdd", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "evaluate/route.ts:stream catch",
              message: "Stream error captured",
              data: { errorMessage: errMsg },
              timestamp: Date.now(),
              hypothesisId: "H5",
            }),
          }).catch(() => {});
          // #endregion
          controller.enqueue(encoder.encode(`[Error: ${errMsg}]`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
