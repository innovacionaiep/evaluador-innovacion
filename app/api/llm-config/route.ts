import { NextResponse } from "next/server";
import {
  getLlmConfigPublic,
  loadLlmModels,
  saveLlmModelsConfig,
} from "@/lib/llm-config-server";
import { isLlmModelsComplete, LLM_USE_CASES, type LlmUseCase } from "@/lib/llm-config-types";

export async function GET() {
  try {
    return NextResponse.json(await getLlmConfigPublic());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const current = await loadLlmModels();

    const models = { ...current };
    if (body?.models && typeof body.models === "object") {
      for (const useCase of LLM_USE_CASES) {
        const val = (body.models as Record<string, unknown>)[useCase];
        if (typeof val === "string") {
          models[useCase] = val.trim();
        }
      }
    }

    if (!isLlmModelsComplete(models)) {
      return NextResponse.json(
        { error: "Debe configurar un modelo para cada función." },
        { status: 400 }
      );
    }

    await saveLlmModelsConfig(models);
    return NextResponse.json({ ok: true, ...(await getLlmConfigPublic()) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
