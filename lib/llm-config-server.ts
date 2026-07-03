import "server-only";
import fs from "fs";
import path from "path";
import { getLlmModels, initDb, saveLlmModels } from "@/lib/db";
import {
  LLM_USE_CASE_DEFAULTS,
  type LlmConfigPublic,
  type LlmUseCase,
} from "@/lib/llm-config-types";

const LEGACY_CONFIG_PATH = path.join(process.cwd(), "data", "llm-config.json");

let modelsCache: Record<LlmUseCase, string> | null = null;
let modelsLoadPromise: Promise<void> | null = null;

function defaultModels(): Record<LlmUseCase, string> {
  return { ...LLM_USE_CASE_DEFAULTS };
}

function normalizeModels(raw: Record<string, unknown> | null | undefined): Record<LlmUseCase, string> {
  const models = defaultModels();
  if (!raw) return models;
  for (const useCase of Object.keys(LLM_USE_CASE_DEFAULTS) as LlmUseCase[]) {
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
    const hasCustom = (Object.keys(LLM_USE_CASE_DEFAULTS) as LlmUseCase[]).some(
      (useCase) => models[useCase] !== LLM_USE_CASE_DEFAULTS[useCase]
    );
    return hasCustom ? models : null;
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
    await saveLlmModels(legacy);
    return legacy;
  }

  return defaultModels();
}

async function ensureModelsCache(): Promise<void> {
  if (modelsCache) return;
  if (!modelsLoadPromise) {
    modelsLoadPromise = (async () => {
      modelsCache = await loadModelsFromStore();
    })();
  }
  await modelsLoadPromise;
}

export function invalidateLlmModelsCache(): void {
  modelsCache = null;
  modelsLoadPromise = null;
}

export async function loadLlmModels(): Promise<Record<LlmUseCase, string>> {
  await ensureModelsCache();
  return { ...(modelsCache ?? defaultModels()) };
}

export async function saveLlmModelsConfig(models: Record<LlmUseCase, string>): Promise<void> {
  const normalized = normalizeModels(models);
  await initDb();
  await saveLlmModels(normalized);
  modelsCache = normalized;
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

export async function resolveModelForUseCase(
  useCase: LlmUseCase,
  override?: string
): Promise<string> {
  if (override?.trim()) return override.trim();

  await ensureModelsCache();
  const fromConfig = modelsCache?.[useCase]?.trim();
  if (fromConfig) return fromConfig;

  const envMap: Partial<Record<LlmUseCase, string | undefined>> = {
    chat: process.env.OPENROUTER_MODEL,
    router: process.env.OPENROUTER_MODEL,
    agent: process.env.OPENROUTER_MODEL,
    evaluate: process.env.OPENROUTER_MODEL,
    extract: process.env.OPENROUTER_MODEL,
    vision: process.env.OPENROUTER_EXTRACT_MODEL,
    embeddings: process.env.OPENROUTER_EMBEDDING_MODEL,
  };
  const fromEnv = envMap[useCase]?.trim();
  if (fromEnv) return fromEnv;

  return LLM_USE_CASE_DEFAULTS[useCase];
}

export async function getLlmConfigPublic(): Promise<LlmConfigPublic> {
  const models = await loadLlmModels();
  return {
    models,
    hasOpenRouterApiKey: hasOpenRouterApiKey(),
  };
}
