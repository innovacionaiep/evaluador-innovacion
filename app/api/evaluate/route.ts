import { NextResponse } from "next/server";
import { getConfig } from "@/lib/db";
import { runEvaluatePipeline } from "@/lib/evaluate-pipeline";
import { assertLlmModelsConfigured } from "@/lib/llm-config-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await assertLlmModelsConfigured();
    const body = await request.json();
    const evaluationTypeId = Number(body?.evaluationTypeId);
    const projectElementsTable = Array.isArray(body?.projectElementsTable)
      ? (body.projectElementsTable as { element?: string; content?: string }[]).filter(
          (r) => r && typeof r.element === "string"
        ).map((r) => ({ element: r.element!, content: typeof r.content === "string" ? r.content : "" }))
      : undefined;

    if (!Number.isInteger(evaluationTypeId) || evaluationTypeId < 1) {
      return NextResponse.json({ error: "evaluationTypeId required" }, { status: 400 });
    }
    if (!projectElementsTable || projectElementsTable.length === 0) {
      return NextResponse.json(
        {
          error: "no_project",
          message: "No hay proyecto extraído. Suba archivos del proyecto y espere a que termine la extracción antes de evaluar.",
        },
        { status: 400 }
      );
    }

    const config = await getConfig(evaluationTypeId);
    const hasRubric = !!((config?.rubric_prompt ?? "").trim());
    if (!config || !hasRubric) {
      return NextResponse.json(
        {
          error: "no_rubric",
          message: "No hay rúbrica configurada. Configure una rúbrica en Configuración (campo Rúbrica) antes de evaluar.",
        },
        { status: 400 }
      );
    }

    const reportFormat = (config.report_format ?? "").trim();
    if (!reportFormat) {
      return NextResponse.json(
        {
          error: "no_report_format",
          message: "No hay formato de informe configurado. Configure el campo 'Formato de informe' en Configuración.",
        },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of runEvaluatePipeline(
            evaluationTypeId,
            projectElementsTable,
            reportFormat
          )) {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: errMsg }) + "\n"));
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
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
