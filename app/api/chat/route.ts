import { NextResponse } from "next/server";
import { buildSystemContext } from "@/lib/build-context";
import { streamChat } from "@/lib/groq";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const evaluationTypeId = Number(body?.evaluationTypeId);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const projectFilePaths = Array.isArray(body?.projectFilePaths)
      ? (body.projectFilePaths as string[]).filter((p: unknown) => typeof p === "string")
      : [];
    const history = Array.isArray(body?.messages)
      ? (body.messages as { role: string; content: string }[]).filter(
          (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
        )
      : [];

    if (!Number.isInteger(evaluationTypeId) || evaluationTypeId < 1) {
      return NextResponse.json({ error: "evaluationTypeId required" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const systemContent = await buildSystemContext(evaluationTypeId, projectFilePaths);
    const languageInstruction =
      "Responde siempre en español. Todas tus respuestas deben estar escritas íntegramente en español.\n\n";
    const baseInstruction =
      "Eres un asistente experto en evaluación de proyectos. Responde con claridad y basándote en la documentación y rúbrica cuando estén disponibles. No uses nunca las etiquetas <think> ni </think> en tus respuestas; responde directamente sin mostrar tu razonamiento interno.";
    const systemMessage =
      languageInstruction + (systemContent || baseInstruction);

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemMessage },
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: message },
    ];

    const stream = streamChat(messages);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`[Error: ${err instanceof Error ? err.message : String(err)}]`));
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
