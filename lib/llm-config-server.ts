import "server-only";
import fs from "fs";
import path from "path";
import { getLlmModels, initDb, saveLlmModels } from "@/lib/db";
import {
  emptyLlmModels,
  isLlmModelsComplete,
  LLM_USE_CASE_LABELS,
  LLM_USE_CASES,
  type LlmConfigPublic,
  type LlmUseCase,
} from "@/lib/llm-config-types";

const LEGACY_CONFIG_PATH = path.join(process.cwd(), "data", "llm-config.json");

function normalizeModels(raw: Record<string, unknown> | null | undefined): Record<LlmUseCase, string> {
  const models = emptyLlmModels();
  if (!raw) return models;
  for (const useCase of LLM_USE_CASES) {
    const val = raw[useCase];
    if (typeof val === "string" && val.trim()) {
      models[useCase] = val.trim();
    }
  }
  return models;
}

function readLegacyModelsFromFile(): Record<LlmUseCase, string> | null {
  try {
    if (!fs.existsSync(LEGACY_CONFIG_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(LEGACY_CONFIG_PATH, "utf-8")) as Record<string, unknown>;
    if (!raw?.models || typeof raw.models !== "object") return null;
    const models = normalizeModels(raw.models as Record<string, unknown>);
    return LLM_USE_CASES.some((useCase) => !!models[useCase].trim()) ? models : null;
  } catch {
    return null;
  }
}

async function loadModelsFromStore(): Promise<Record<LlmUseCase, string>> {
  await initDb();
  const fromDb = await getLlmModels();
  if (fromDb) return normalizeModels(fromDb);

  const legacy = readLegacyModelsFromFile();
  if (legacy) {
    if (isLlmModelsComplete(legacy)) {
      await saveLlmModels(legacy);
    }
    return legacy;
  }

  return emptyLlmModels();
}

export async function loadLlmModels(): Promise<Record<LlmUseCase, string>> {
  return loadModelsFromStore();
}

export async function saveLlmModelsConfig(models: Record<LlmUseCase, string>): Promise<void> {
  const normalized = normalizeModels(models);
  if (!isLlmModelsComplete(normalized)) {
    throw new Error("Debe configurar un modelo para cada función en Configurar LLM.");
  }
  await initDb();
  await saveLlmModels(normalized);
}

export function getApiKey(): string {
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  if (envKey) return envKey;

  throw new Error(
    "No hay API key de OpenRouter configurada. Añádala en la variable de entorno OPENROUTER_API_KEY."
  );
}

export function hasOpenRouterApiKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY?.trim();
}

/** Siempre lee desde la base de datos (sin caché en memoria) para evitar modelos obsoletos en serverless. */
export async function resolveModelForUseCase(
  useCase: LlmUseCase,
  override?: string
): Promise<string> {
  if (override?.trim()) return override.trim();

  const models = await loadModelsFromStore();
  const model = models[useCase]?.trim();
  if (!model) {
    throw new Error(
      `No hay modelo configurado para «${LLM_USE_CASE_LABELS[useCase]}». ` +
        "Defínalo en Configurar LLM antes de usar esta función."
    );
  }
  return model;
}

export async function getLlmConfigPublic(): Promise<LlmConfigPublic> {
  const models = await loadLlmModels();
  return {
    models,
    hasOpenRouterApiKey: hasOpenRouterApiKey(),
    modelsComplete: isLlmModelsComplete(models),
  };
}

export async function assertLlmModelsConfigured(): Promise<void> {
  const models = await loadLlmModels();
  if (isLlmModelsComplete(models)) return;
  const missing = LLM_USE_CASES.filter((useCase) => !models[useCase]?.trim()).map(
    (useCase) => LLM_USE_CASE_LABELS[useCase]
  );
  throw new Error(
    `Faltan modelos en Configurar LLM: ${missing.join(", ")}. ` +
      "Todos los campos son obligatorios; no hay modelos por defecto."
  );
}
