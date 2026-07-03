import { NextResponse } from "next/server";
import {
  getLlmConfigPublic,
  loadLlmModels,
  saveLlmModelsConfig,
} from "@/lib/llm-config-server";
import { LLM_USE_CASE_DEFAULTS, type LlmUseCase } from "@/lib/llm-config-types";

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
      for (const useCase of Object.keys(LLM_USE_CASE_DEFAULTS) as LlmUseCase[]) {
        const val = (body.models as Record<string, unknown>)[useCase];
        if (typeof val === "string") {
          models[useCase] = val.trim() || LLM_USE_CASE_DEFAULTS[useCase];
        }
      }
    }

    await saveLlmModelsConfig(models);
    return NextResponse.json({ ok: true, ...(await getLlmConfigPublic()) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
