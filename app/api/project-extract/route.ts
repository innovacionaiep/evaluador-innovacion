import { NextResponse } from "next/server";
import { runExtractPipeline } from "@/lib/project-extract-pipeline";
import { saveProjectBuffersToSession } from "@/lib/session-project-files";

export const maxDuration = 300;

type ExtractParams = {
  projectFilePaths: string[];
  evaluationTypeId: number | null;
  streamRequested: boolean;
  sessionId: string;
  useAgent: boolean;
  skipReindex: boolean;
};

async function parseExtractRequest(request: Request): Promise<ExtractParams> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const sessionId = (formData.get("sessionId") as string) || "default";
    const typeIdRaw = formData.get("evaluationTypeId");
    const evaluationTypeId =
      typeIdRaw != null && typeIdRaw !== "" ? Number(typeIdRaw) : null;
    const streamRequested = formData.get("stream") === "true";
    const useAgent = formData.get("useAgent") === "true";
    const skipReindex = formData.get("skipReindex") === "false" ? false : true;
    const replace = formData.get("replace") !== "false";
    const files = formData.getAll("files") as File[];

    const buffers: { name: string; buffer: Buffer }[] = [];
    for (const file of files) {
      if (!file?.name) continue;
      buffers.push({
        name: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
      });
    }

    const projectFilePaths =
      buffers.length > 0
        ? saveProjectBuffersToSession(sessionId, buffers, { replace })
        : [];

    return {
      projectFilePaths,
      evaluationTypeId: Number.isInteger(evaluationTypeId) ? evaluationTypeId : null,
      streamRequested,
      sessionId,
      useAgent,
      skipReindex,
    };
  }

  const body = await request.json();
  const projectFilePaths = Array.isArray(body?.projectFilePaths)
    ? (body.projectFilePaths as string[]).filter((p) => typeof p === "string")
    : [];
  const evaluationTypeId =
    typeof body?.evaluationTypeId === "number" ? body.evaluationTypeId : null;
  const streamRequested = body?.stream === true;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "default";
  const useAgent = body?.useAgent === true;
  const skipReindex = body?.skipReindex !== false;

  return {
    projectFilePaths,
    evaluationTypeId,
    streamRequested,
    sessionId,
    useAgent,
    skipReindex,
  };
}

/** Extrae proyecto con pipeline LLM-first: RAG por sesión + búsqueda integral por elemento. */
export async function POST(request: Request) {
  try {
    const params = await parseExtractRequest(request);

    if (params.projectFilePaths.length === 0) {
      return NextResponse.json({ text: "" });
    }

    const pipelineInput = {
      sessionId: params.sessionId,
      projectFilePaths: params.projectFilePaths,
      evaluationTypeId: params.evaluationTypeId,
      useAgent: params.useAgent,
      skipReindex: params.skipReindex,
    };

    if (params.streamRequested) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of runExtractPipeline(pipelineInput)) {
              const payload =
                event.type === "done"
                  ? { ...event, projectFilePaths: params.projectFilePaths }
                  : event;
              controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
            }
          } catch (err) {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "error", error: String(err) }) + "\n")
            );
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    let text = "";
    let elementsTable: { section: string; element: string; content: string }[] | undefined;
    let structuredData: unknown;

    for await (const event of runExtractPipeline(pipelineInput)) {
      if (event.type === "done") {
        text = event.text;
        elementsTable = event.elementsTable;
        structuredData = event.structuredData;
      } else if (event.type === "error") {
        return NextResponse.json({ error: event.error, text: "" }, { status: 500 });
      }
    }

    return NextResponse.json({
      text,
      structured: true,
      structuredData,
      elementsTable,
      projectFilePaths: params.projectFilePaths,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e), text: "" }, { status: 500 });
  }
}
