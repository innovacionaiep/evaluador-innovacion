import { getEvaluationTypeById } from "@/lib/db";
import { indexKnowledge, type IndexKnowledgeProgress } from "@/lib/rag-index";

export const maxDuration = 300;

type ReindexEvent =
  | ({ type: "progress" } & IndexKnowledgeProgress)
  | { type: "done"; chunkCount: number }
  | { type: "error"; error: string };

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) {
      return Response.json({ error: "Invalid id" }, { status: 400 });
    }
    const type = await getEvaluationTypeById(id);
    if (!type) {
      return Response.json({ error: "Evaluation type not found" }, { status: 404 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: ReindexEvent) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        try {
          const { chunkCount } = await indexKnowledge(id, {
            onProgress: (p) => send({ type: "progress", ...p }),
          });
          send({ type: "done", chunkCount });
        } catch (e) {
          send({ type: "error", error: String(e) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
